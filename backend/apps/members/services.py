"""Roster join-request services (M4 D3 — confirm/reject in the roster view).

Single source (P4): the confirmation rule lives HERE. Confirming a pending
request is the ONLY way a campus self-join becomes a ``domain.Membership``
row, and it is idempotent at the membership level (``get_or_create``): a
member added through any other path is reused, never duplicated, and the
decision is always audited (M8 ethic: zero silent loss).
"""

from __future__ import annotations

import re
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.domain.models import Membership

from .models import JoinRequest


class MemberError(Exception):
    """Roster-side error carrying a machine code + HTTP status for views."""

    def __init__(self, message: str, *, code: str, http_status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.http_status = http_status


def _audit(
    action: str, request: Any = None, *, actor: Any = None, **detail: Any
) -> None:
    """Append exactly one audit row for a roster decision (M1 pattern)."""
    from apps.audit.services import record as audit_record

    actor_id = getattr(actor, "pk", None) if actor is not None else None
    audit_record(
        action=action,
        request=request,
        actor_id=int(actor_id) if actor_id is not None else None,
        actor_label=actor.get_username() if actor is not None else "",
        detail=detail,
    )


def confirm_join(
    *, join_request: JoinRequest, decided_by: Any, request: Any = None
) -> Membership:
    """Approve a pending join and create/reuse THE membership row (W6/W9).

    Only ``pending`` requests can be decided (a re-decide is a 409 — the
    decision log stays truthful). The membership itself is
    ``get_or_create``: confirming can never duplicate a roster row (P2) and
    never silently drops the request (P5/M8).
    """
    if join_request.status != JoinRequest.Status.PENDING:
        raise MemberError(
            "That join request is already decided.",
            code="already_decided",
            http_status=409,
        )
    with transaction.atomic():
        membership, created = Membership.objects.get_or_create(
            user=join_request.user,
            club=join_request.club,
            defaults={
                "role": Membership.Role.MEMBER,
                "status": Membership.Status.ACTIVE,
            },
        )
        join_request.status = JoinRequest.Status.APPROVED
        join_request.decided_by = decided_by
        join_request.decided_at = timezone.now()
        join_request.save(update_fields=["status", "decided_by", "decided_at"])

        from datetime import timedelta

        from apps.accounts.models import AccountState
        from apps.members.models import StudentMemberProfile

        if join_request.user.account_state == AccountState.PENDING_APPROVAL:
            join_request.user.account_state = AccountState.ACTIVE
            join_request.user.save(update_fields=["account_state"])

        default_expiry = timezone.localdate() + timedelta(days=365)
        StudentMemberProfile.objects.get_or_create(
            user=join_request.user,
            club=join_request.club,
            defaults={
                "validity_years": 1,
                "valid_until": default_expiry,
                "gender": "other",
                "department": "General",
                "roll_number": join_request.user.username,
            },
        )
    _audit(
        "club_join.confirmed",
        request,
        actor=decided_by,
        object_type="join_request",
        object_id=str(join_request.pk),
        club=join_request.club_id,
        membership_created=created,
    )
    return membership


def reject_join(
    *, join_request: JoinRequest, decided_by: Any, request: Any = None
) -> JoinRequest:
    """Reject a pending join (audited; the student may re-request later)."""
    if join_request.status != JoinRequest.Status.PENDING:
        raise MemberError(
            "That join request is already decided.",
            code="already_decided",
            http_status=409,
        )
    join_request.status = JoinRequest.Status.REJECTED
    join_request.decided_by = decided_by
    join_request.decided_at = timezone.now()
    join_request.save(update_fields=["status", "decided_by", "decided_at"])
    _audit(
        "club_join.rejected",
        request,
        actor=decided_by,
        object_type="join_request",
        object_id=str(join_request.pk),
        club=join_request.club_id,
    )
    return join_request


def join_request_payload(join_request: JoinRequest) -> dict[str, Any]:
    """Roster-view row: member identity stays BEHIND Module 2 auth (M4-A2)."""
    user = join_request.user
    profile = getattr(user, "student_profile", None)
    return {
        "id": join_request.pk,
        "user_id": user.pk,
        "user": {"username": user.get_username(), "email": user.email},
        "full_name": user.get_full_name() or user.username,
        "email": user.email,
        "gender": getattr(profile, "gender", "other"),
        "department": getattr(profile, "department", "General"),
        "roll_number": getattr(profile, "roll_number", user.username),
        "club_code": join_request.club_id,
        "source": join_request.source,
        "status": join_request.status,
        "created_at": join_request.created_at,
        "decided_at": join_request.decided_at,
    }


def batch_confirm_joins(
    *,
    club_code: str,
    decided_by: Any,
    request_ids: list[int] | None = None,
    approve_all: bool = False,
    request: Any = None,
) -> list[dict[str, Any]]:
    """Approve all or selected pending join requests."""
    from datetime import timedelta

    from apps.domain.models import Membership
    from apps.members.models import JoinRequest, StudentMemberProfile

    qs = JoinRequest.objects.filter(
        club__code__iexact=club_code, status=JoinRequest.Status.PENDING
    )
    if not approve_all and request_ids is not None:
        qs = qs.filter(id__in=request_ids)

    results = []
    now = timezone.now()
    default_expiry = timezone.localdate() + timedelta(days=365)

    with transaction.atomic():
        for req in qs.select_related("user", "club"):
            membership, _created = Membership.objects.get_or_create(
                user=req.user,
                club=req.club,
                defaults={
                    "role": Membership.Role.MEMBER,
                    "status": Membership.Status.ACTIVE,
                },
            )
            req.status = JoinRequest.Status.APPROVED
            req.decided_by = decided_by
            req.decided_at = now
            req.save(update_fields=["status", "decided_by", "decided_at"])

            from apps.accounts.models import AccountState

            if req.user.account_state == AccountState.PENDING_APPROVAL:
                req.user.account_state = AccountState.ACTIVE
                req.user.save(update_fields=["account_state"])

            # Ensure profile exists with validity
            StudentMemberProfile.objects.get_or_create(
                user=req.user,
                club=req.club,
                defaults={
                    "validity_years": 1,
                    "valid_until": default_expiry,
                    "gender": "other",
                    "department": "General",
                    "roll_number": req.user.username,
                },
            )
            results.append(
                {"join_id": req.pk, "username": req.user.username, "status": "approved"}
            )

    return results


def process_school_roster_csv(
    *,
    club_code: str,
    csv_rows: list[dict[str, str]],
    batch_year: int = 2026,
) -> dict[str, Any]:
    """Parse CSV rows and create SchoolStudentRoster entries with deterministic UIDs."""
    from apps.domain.models import Club
    from apps.members.models import SchoolStudentRoster

    club = (
        Club.objects.select_related("institution__state")
        .filter(code__iexact=club_code)
        .first()
    )
    if not club:
        raise MemberError("Club not found.", code="club_not_found", http_status=404)

    state_prefix = (
        club.institution.state.code[:2]
        if club.institution and club.institution.state
        else "IN"
    ).upper()
    club_clean = re.sub(r"[^A-Za-z0-9]+", "", club.code).upper()[:8]

    # Find highest existing serial
    existing_count = SchoolStudentRoster.objects.filter(club=club).count()
    created_entries = []

    for idx, row in enumerate(csv_rows, start=existing_count + 1):
        name = str(
            row.get("student_name")
            or row.get("Full Name")
            or row.get("full_name")
            or row.get("Name")
            or ""
        ).strip()
        gender = str(row.get("Gender") or row.get("gender") or "Other").strip()
        s_class = str(
            row.get("class_grade")
            or row.get("Class")
            or row.get("class")
            or row.get("Standard")
            or "I"
        ).strip()
        section = str(row.get("Section") or row.get("section") or "A").strip()
        phone = str(
            row.get("Guardian Phone")
            or row.get("guardian_phone")
            or row.get("Phone")
            or ""
        ).strip()

        if not name:
            continue

        clean_cls = re.sub(r"[^A-Za-z0-9]+", "", s_class).upper()[:4]
        clean_sec = re.sub(r"[^A-Za-z0-9]+", "", section).upper()[:2]
        uid = f"SCH-{state_prefix}-{club_clean}-{clean_cls}{clean_sec}-{idx:03d}"

        entry = SchoolStudentRoster.objects.create(
            club=club,
            student_uid=uid,
            full_name=name,
            gender=gender,
            student_class=s_class,
            section=section,
            guardian_phone=phone,
            batch_year=batch_year,
            is_active=True,
        )
        created_entries.append(
            {
                "id": entry.id,
                "student_uid": entry.student_uid,
                "full_name": entry.full_name,
                "student_class": entry.student_class,
                "section": entry.section,
            }
        )

    return {
        "club_code": club.code,
        "total_imported": len(created_entries),
        "entries": created_entries,
    }
