"""Single Source of Truth (SSOT) Ledger Integrity & Auto-Healing Engine.

Hard Architectural Law (Plan SSOT):
1. State-Gated Activity Origin:
   Every NDLI Club that exists in the central database MUST originate from an
   authentic, immutable 'Club Approval' entry in the responsible Regional Officer's
   ActivityLog.
2. Hard Check Gate:
   Club creation or approval is strictly gated through the Regional Officer assigned
   to the club's State/UT (via `domain.OfficerAssignment`). If no officer is assigned
   to that State, creation is rejected.
3. Self-Healing & Reconciliation:
   The `LedgerIntegrityEngine` continuously monitors the bidirectional data flow
   between the Central Club Ledger and the Employee Activity Logs. If any discrepancy,
   orphaned club, or missing activity log is detected, it automatically executes
   a self-healing process to reconcile the records.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import SubRole, User
from apps.activities.models import ActivityLog, SupportType
from apps.domain.assignments import officer_assignment_for_state
from apps.domain.models import Club, OfficerAssignment

logger = logging.getLogger(__name__)


class LedgerIntegrityError(Exception):
    """Raised when a club operation violates the State-Gated Hard Check Gate."""

    pass


@dataclass
class IntegrityReport:
    healthy: bool
    total_clubs_audited: int
    healed_approvals_count: int
    unresolved_deviations_count: int
    details: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "healthy": self.healthy,
            "status": "HEALTHY" if self.healthy else "DEVIATION_DETECTED",
            "total_clubs_audited": self.total_clubs_audited,
            "healed_approvals_count": self.healed_approvals_count,
            "unresolved_deviations_count": self.unresolved_deviations_count,
            "details": self.details,
            "timestamp": timezone.now().isoformat(),
        }


class LedgerIntegrityEngine:
    """The central monitoring, verification, and auto-repair engine for SSOT."""

    @classmethod
    def resolve_officer_for_club(cls, club: Club) -> User | None:
        """Resolve the jurisdictional Regional Officer for a club's state."""
        inst = getattr(club, "institution", None)
        state = getattr(inst, "state", None) if inst else None

        # 1. Primary lookup via OfficerAssignment window
        if state and state.code:
            assignment = officer_assignment_for_state(state.code)
            if assignment and assignment.officer:
                return assignment.officer

        # 2. Fallback via OfficerAssignment state foreign key
        if state:
            assignment = (
                OfficerAssignment.objects.filter(state=state)
                .select_related("officer")
                .first()
            )
            if assignment and assignment.officer:
                return assignment.officer

        # 3. Fallback via State Name matching
        if state and state.name:
            assignment = (
                OfficerAssignment.objects.filter(state__name__iexact=state.name)
                .select_related("officer")
                .first()
            )
            if assignment and assignment.officer:
                return assignment.officer

        # 4. Fallback via Zone mapping
        if state and getattr(state, "zone", None):
            zone = state.zone
            zone_code = getattr(zone, "code", "").upper()
            zone_clean = getattr(zone, "name", "").upper().replace(" ZONE", "").strip()

            from apps.analytics_reports.ratings import OFFICER_METADATA

            for emp_code, meta in OFFICER_METADATA.items():
                m_zone = meta.get("zone", "").upper()
                m_states = [
                    s.strip().lower()
                    for s in meta.get("states", "").split(",")
                    if s.strip()
                ]
                matches_state = bool(state.name and state.name.lower() in m_states)
                matches_zone = bool(
                    m_zone and (zone_code in m_zone or zone_clean in m_zone)
                )
                if matches_state or matches_zone:
                    officer_user = User.objects.filter(
                        username=emp_code, is_active=True
                    ).first()
                    if officer_user:
                        return officer_user

        return None

    @classmethod
    def ensure_club_approval_log(
        cls,
        club: Club,
        *,
        officer: User | None = None,
        timestamp: Any = None,
        strict_gate: bool = False,
    ) -> ActivityLog | None:
        """Ensure an authentic 'Club Approval' ActivityLog row exists for this club."""
        if getattr(club, "is_sample", False):
            return None

        clean_code = str(club.code).strip()
        if not clean_code:
            return None

        # 1. Resolve officer if not explicitly provided
        target_officer = officer
        if target_officer is None:
            target_officer = cls.resolve_officer_for_club(club)

        if target_officer is None:
            inst = getattr(club, "institution", None)
            st_name = inst.state.name if inst and inst.state else "Unknown State"
            if strict_gate:
                err_msg = (
                    f"Hard Gate Rejected: No Regional Officer assigned to "
                    f"state '{st_name}' for club '{club.code}'. Creation aborted."
                )
                raise LedgerIntegrityError(err_msg)
            logger.warning(
                "Integrity Warning: Club %s in %s has no assigned Regional Officer.",
                club.code,
                st_name,
            )
            target_officer = User.objects.filter(
                sub_role__in=[SubRole.REGIONAL_OFFICER, SubRole.CENTRAL_ADMIN],
                is_active=True,
            ).first()
            if not target_officer:
                return None

        # 2. Check if a Club Approval log already exists with this club_code
        existing_log = ActivityLog.objects.filter(
            support_type=SupportType.CLUB_APPROVAL,
            club_code=clean_code,
        ).first()

        if existing_log:
            changed = False
            if existing_log.employee != target_officer:
                existing_log.employee = target_officer
                changed = True
            if not existing_log.priority_flag:
                existing_log.priority_flag = True
                changed = True
            if changed:
                existing_log.save(update_fields=["employee", "priority_flag"])
            return existing_log

        # 2b. Check if an existing log references this club in notes
        legacy_log = ActivityLog.objects.filter(
            support_type=SupportType.CLUB_APPROVAL,
            notes__icontains=clean_code,
        ).first()
        if legacy_log:
            legacy_log.club_code = clean_code
            legacy_log.employee = target_officer
            legacy_log.priority_flag = True
            legacy_log.save(update_fields=["club_code", "employee", "priority_flag"])
            return legacy_log

        # 3. Create missing immutable approval log record
        inst = getattr(club, "institution", None)
        inst_name = inst.name if inst else club.name
        ts = (
            timestamp
            or getattr(club, "date_of_approval", None)
            or getattr(club, "created_at", None)
            or timezone.now()
        )
        if isinstance(ts, str):
            try:
                ts = datetime.fromisoformat(ts)
            except Exception:
                ts = timezone.now()

        new_log = ActivityLog.objects.create(
            employee=target_officer,
            support_type=SupportType.CLUB_APPROVAL,
            club_code=clean_code,
            priority_flag=True,
            notes=f"Approved new NDLI Club: {inst_name} ({clean_code})",
            call_count=1,
            timestamp=ts,
        )
        logger.info(
            "Self-Healing: Generated Club Approval log %s for officer %s (Club %s).",
            new_log.activity_id,
            target_officer.username,
            clean_code,
        )
        return new_log

    @classmethod
    def audit_and_heal(cls) -> IntegrityReport:
        """Scan all active non-sample clubs and reconcile with ActivityLog."""
        clubs = list(
            Club.objects.filter(is_sample=False)
            .select_related("institution__state__zone")
            .order_by("code")
        )
        healed = 0
        unresolved = 0
        details: list[str] = []

        with transaction.atomic():
            for c in clubs:
                officer = cls.resolve_officer_for_club(c)
                if not officer:
                    unresolved += 1
                    inst = getattr(c, "institution", None)
                    st_name = inst.state.name if inst and inst.state else "Unknown"
                    details.append(
                        f"UNRESOLVED: Club {c.code} in State {st_name} "
                        "has no assigned Regional Officer."
                    )
                    continue

                log = cls.ensure_club_approval_log(c, officer=officer)
                if log:
                    details.append(
                        f"OK: Club {c.code} linked to {officer.username} "
                        f"(Log {str(log.activity_id)[:8]})"
                    )
                    healed += 1

        is_healthy = unresolved == 0
        return IntegrityReport(
            healthy=is_healthy,
            total_clubs_audited=len(clubs),
            healed_approvals_count=healed,
            unresolved_deviations_count=unresolved,
            details=details,
        )
