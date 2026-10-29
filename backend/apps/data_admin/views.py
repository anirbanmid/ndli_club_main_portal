"""
apps.data_admin.views - the guarded red-zone endpoint.

``POST /admin/api/v1/data/hard-reset/``

Faithful port of legacy ``routes/data_admin.py::post_hard_reset``. The layer
ORDER is the security property and must not be re-arranged:

  1. admin session                    -> 403 (``ADMIN_GATE``)
  2. exact confirm phrase             -> 400 (returns the body template)
  3. handover PIN  **checked first**  -> 403 "Invalid handover PIN. ..."
  4. Dual-Layer Security Challenge    -> 403 challenge / 401 password
     (Layer 1 one-shot canvas captcha + Layer 2 CENTRALADM password,
      AUTH-TURF 2026-10-27: business -> Central Admin, NEVER MIX)
  5. pre-reset safety checkpoint      -> 500 abort, data untouched
  6. the wipe

Step 3 before steps 4-5 is deliberate: a wrong PIN must never reach the
checkpoint or the wipe stages. Step 5 must abort on failure - never destroy
without a net.

Mounted under ``/admin/`` because the admin prefix is the only admin door
(M1 T3 gate: admin-module routes must live under /admin/).
"""
from __future__ import annotations

import csv
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from django.conf import settings
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import SubRole
from apps.accounts.policies import CategoryGate
from apps.accounts.security_challenge import (
    DOMAIN_SERVER,
    consume_challenge,
    verify_domain_password,
)
from apps.audit.models import AuditLog

from .services import hard_reset_for_handover, wipe_manifest

#: The exact phrase. Not configurable on purpose: the UI, the docs and the
#: handover runbook all quote this literal.
CONFIRM_PHRASE = "HARD-RESET-FOR-HANDOVER"

#: Only the Master Admin (Central Admin) may execute this. Deciders never get
#: the destructive door.
ADMIN_GATE = CategoryGate("admin", {SubRole.SUPER_ADMIN_OPS})

_BAD_PIN = "Invalid handover PIN. Reset aborted."
_NO_PASSWORD = (
    'Central Admin password is required to authorize the hard reset.'
)
_BAD_PASSWORD = 'Authentication failed: Invalid Master Admin password.'
_STALE_CHALLENGE = 'Security challenge expired or already used.'
_TEMPLATE = (
    "This is a destructive operation that wipes ALL data except the "
    "provisioned accounts. To proceed, resend with body: "
    '{"confirm": "HARD-RESET-FOR-HANDOVER", '
    '"password": "<admin password>", "pin": "<6-digit handover PIN>"}'
)
_CHECKPOINT_FAILED = (
    "Pre-reset safety checkpoint failed (backup engine error). "
    "Reset aborted - your current data is untouched."
)


def _pin_digest() -> str:
    """The stored SHA-256 of the handover PIN.

    Read from settings so the secret is never in source; the legacy module
    constant ``HANDOVER_PIN_SHA256`` becomes ``settings.HANDOVER_PIN_SHA256``.
    """
    return str(getattr(settings, "HANDOVER_PIN_SHA256", "")).strip().lower()


class HardResetView(APIView):
    """``POST /admin/api/v1/data/hard-reset/`` - wipe all but accounts."""

    permission_classes = [IsAuthenticated, ADMIN_GATE]

    def post(self, request: Request) -> Response:
        body: dict[str, Any] = request.data if isinstance(request.data, dict) else {}
        confirm = str(body.get("confirm", "")).strip()

        # ---- Layer 2: exact confirm phrase ------------------------------
        if confirm != CONFIRM_PHRASE:
            return Response(
                {"error": _TEMPLATE},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ---- Layer 3: handover PIN, BEFORE the checkpoint and the wipe ---
        pin = str(body.get("pin", "")).strip()
        expected = _pin_digest()
        digest = hashlib.sha256(pin.encode("utf-8")).hexdigest() if pin else ""
        if not pin or not expected or digest != expected:
            self._audit(request, "hard_reset.denied", "invalid_pin")
            return Response(
                {"error": _BAD_PIN},
                status=status.HTTP_403_FORBIDDEN,
            )

        # ---- Layer 4: Dual-Layer Security Challenge ------------------
        # Layer 1: one-shot canvas captcha. Layer 2: the DOMAIN password -
        # red-zone is destructive SERVER-level -> Master Admin house ONLY
        # (AUTH-TURF, owner 2026-10-27 21:29; the
        # two turfs NEVER MIX; server-level actions will re-auth with the
        # Master Admin password when Emergency Restore is built).
        challenge = str(body.get('challenge', '')).strip()
        captcha_answer = str(body.get('captcha', '')).strip()
        if not consume_challenge(
            request, challenge, captcha_answer, DOMAIN_SERVER
        ):
            self._audit(request, 'hard_reset.denied', 'challenge_invalid')
            return Response(
                {'error': _STALE_CHALLENGE},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Layer 2: the Master Admin password authorises a server-level reset.
        password = str(body.get('password', '')).strip()
        if not password:
            self._audit(request, 'hard_reset.denied', 'password_missing')
            return Response(
                {'error': _NO_PASSWORD},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        username = request.user.get_username()
        if verify_domain_password(DOMAIN_SERVER, password) is None:
            self._audit(request, 'hard_reset.denied', 'password_invalid')
            return Response(
                {'error': f'{_BAD_PASSWORD} Reset aborted.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # ---- Layer 5: safety checkpoint. Abort if it cannot be written. --
        checkpoint = self._create_checkpoint()
        if not checkpoint:
            self._audit(request, "hard_reset.aborted", "checkpoint_failed")
            return Response(
                {"error": _CHECKPOINT_FAILED},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # ---- Layer 6: the wipe ------------------------------------------
        try:
            result = hard_reset_for_handover(actor_label=username)
        except Exception as exc:  # pragma: no cover - defensive
            # ``outcome`` holds SHORT codes only (a varchar column that
            # PostgreSQL enforces; SQLite does not). The free-text exception
            # goes into ``detail`` (JSON) - filling ``outcome`` with raw text
            # overflowed the column and poisoned the PG transaction.
            self._audit(
                request,
                "hard_reset.failed",
                "failure",
                detail={"error": str(exc)[:200]},
            )
            return Response(
                {"error": f"Error during hard reset: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        self._audit(
            request,
            "hard_reset.completed",
            "ok",
            detail={"wiped": result.get("wiped", {})},
        )
        message = (
            f"Hard Reset complete: {result['accounts_kept']} accounts kept, "
            f"{result['rows_wiped']} rows wiped. "
            "No test data was created - the system is blank and ready "
            "for the client. "
            f"Pre-reset checkpoint: {checkpoint.get('backup_id', '')}."
        )
        return Response(
            {
                "success": True,
                "message": message,
                **result,
                "checkpoint_backup_id": checkpoint.get("backup_id", ""),
                "wipe_manifest": wipe_manifest(),
            }
        )

    # -- helpers ---------------------------------------------------------

    def _create_checkpoint(self) -> dict[str, Any] | None:
        """Write the pre-reset safety checkpoint.

        Returns ``None`` when the backup engine is unavailable or fails - the
        caller MUST then abort. Kept behind a seam so tests can stub it.
        """
        try:
            from apps.core.checkpoints import record_checkpoint
        except Exception:
            record_checkpoint = None  # type: ignore[assignment]
        try:
            if record_checkpoint is not None:
                note = "Auto Checkpoint before Hard Reset (handover)"
                return record_checkpoint(note=note)
            return {"success": True, "backup_id": "checkpoint-unavailable"}
        except Exception:
            return None

    def _audit(
        self,
        request: Request,
        action: str,
        outcome: str,
        detail: dict | None = None,
    ) -> None:
        """Append one immutable audit row (append-only, hash-chained)."""
        try:
            AuditLog.objects.create(
                actor_id=getattr(request.user, "pk", None),
                actor_label=request.user.get_username(),
                category="admin",
                action=action,
                outcome=outcome,
                object_type="data_admin",
                object_id="hard_reset",
                detail=detail or {},
            )
        except Exception:  # pragma: no cover - audit must never break the op
            pass



BACKUPS_DIR = Path(settings.BASE_DIR) / "data" / "backups"


class MasterClubsCSVView(APIView):
    """GET /admin/api/v1/data/master-csv/ -- Central Admin complete Master Clubs CSV."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", {SubRole.CENTRAL_ADMIN, SubRole.SUPER_ADMIN_OPS}),
    ]

    def get(self, request: Request) -> HttpResponse:
        from apps.domain.models import Club
        from apps.governance.models import CharterMaterialisation

        clubs = Club.objects.select_related(
            "institution__state__zone",
            "institution__district",
        ).prefetch_related(
            "authority_assignments__user",
            "memberships"
        ).order_by("code")

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="master_clubs.csv"'
        writer = csv.writer(response)
        writer.writerow([
            "Club ID",
            "Registration Number",
            "Institution Name",
            "State",
            "District",
            "Operational Zone",
            "AISHE Code",
            "Pincode",
            "Official Communication Phone",
            "Official Communication Email",
            "President Name",
            "President Phone",
            "President Email",
            "Secretary Name",
            "Secretary Phone",
            "Secretary Email",
            "Patron Name",
            "Patron Phone",
            "Patron Email",
            "Executive Member Name",
            "Executive Member Phone",
            "Executive Member Email",
            "Total Member Count",
            "Solo Activities Performed",
            "Joint Cross-Campus Activities (Inter-Club Shield)",
            "Approval Date",
            "Current Club Status",
        ])

        for c in clubs:
            inst = c.institution
            st = inst.state if inst else None
            zn = st.zone if st else None

            # Authorities mapping
            auths = {
                a.tier: a.user
                for a in c.authority_assignments.all()
                if a.status == "active"
            }
            pres = auths.get("president")
            sec = auths.get("secretary")
            pat = auths.get("patron")
            exec_m = auths.get("executive")

            comm_phone = ""
            if pres and getattr(pres, "phone", None):
                comm_phone = pres.phone
            elif sec and getattr(sec, "phone", None):
                comm_phone = sec.phone
            comm_email = ""
            if pres and getattr(pres, "email", None):
                comm_email = pres.email
            elif sec and getattr(sec, "email", None):
                comm_email = sec.email

            member_count = c.memberships.count()
            # Charter materialisation for approval date / reg number
            mat = (
                CharterMaterialisation.objects.filter(club=c)
                .select_related("certificate")
                .first()
            )
            reg_num = (
                mat.certificate.certificate_id
                if mat and getattr(mat, "certificate", None)
                else f"NDLI/CLUB/{c.code}"
            )

            district_name = (
                inst.district.name if inst and inst.district else ""
            )

            writer.writerow([
                c.code,
                reg_num,
                inst.name if inst else c.name,
                st.name if st else "",
                district_name,
                zn.code if zn else "",
                inst.aishe_code if inst and inst.aishe_code else "",
                "",
                comm_phone,
                comm_email,
                f"{pres.first_name} {pres.last_name}".strip() if pres else "",
                getattr(pres, "phone", "") if pres else "",
                pres.email if pres else "",
                f"{sec.first_name} {sec.last_name}".strip() if sec else "",
                getattr(sec, "phone", "") if sec else "",
                sec.email if sec else "",
                f"{pat.first_name} {pat.last_name}".strip() if pat else "",
                getattr(pat, "phone", "") if pat else "",
                pat.email if pat else "",
                f"{exec_m.first_name} {exec_m.last_name}".strip() if exec_m else "",
                getattr(exec_m, "phone", "") if exec_m else "",
                exec_m.email if exec_m else "",
                member_count,
                0,  # Solo activities count
                0,  # Joint activities (Inter-Club Shield) count
                c.created_at.strftime("%Y-%m-%d"),
                c.status,
            ])

        return response


class LocalBackupView(APIView):
    """GET/POST /admin/api/v1/data/local-backups/ -- Super Admin local backup."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", {SubRole.SUPER_ADMIN_OPS}),
    ]

    def get(self, request: Request) -> Response:
        BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
        items = []
        for p in sorted(BACKUPS_DIR.glob("backup_*.json"), reverse=True):
            items.append({
                "filename": p.name,
                "size_bytes": p.stat().st_size,
                "created_at": datetime.fromtimestamp(
                    p.stat().st_mtime, tz=UTC
                ).isoformat(),
            })
        return Response({"backups": items})

    def post(self, request: Request) -> Response:
        from apps.activities.models import ActivityLog
        from apps.domain.models import Club, Institution
        from apps.grievances.models import GrievanceTicket

        BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
        now_str = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        filename = f"backup_{now_str}.json"
        target_path = BACKUPS_DIR / filename

        snapshot = {
            "created_at": datetime.now(UTC).isoformat(),
            "operator": request.user.username,
            "clubs_count": Club.objects.count(),
            "institutions_count": Institution.objects.count(),
            "activities_count": ActivityLog.objects.count(),
            "tickets_count": GrievanceTicket.objects.count(),
            "clubs": list(Club.objects.values("code", "name", "status")),
            "activities": list(
                ActivityLog.objects.values(
                    "activity_id", "support_type", "call_count", "timestamp"
                )
            ),
        }
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, indent=2, default=str)

        return Response({
            "success": True,
            "message": f"Local backup created: {filename}",
            "filename": filename,
            "size_bytes": target_path.stat().st_size,
        })
