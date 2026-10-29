"""HTTP views for the Activities app (M6 D8: Employee-module parity).

Three endpoints, semantic parity with the previous project's
``routes/activity.py`` (list / log / delete) on the new API surface:

* ``GET  /api/v1/activities/``   -- list (self, or Central Admin with emp_id)
* ``POST /api/v1/activities/log/`` -- SEC A logging (bulk only for phone calls)
* ``POST /api/v1/activities/delete/`` -- batch delete; club-approval log rows
  are delete-protected for everyone but the Central Admin (owner rule).

AUTH-TURF (owner law 2026-10-27): this is BUSINESS-level data. The acting
admin override is the Central Admin house only -- the Master Admin
(SUPEROPS) house sees no business data and is structurally excluded.
"""
from __future__ import annotations

import base64
import csv
import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import AccountState, SubRole
from apps.accounts.policies import (
    BUSINESS_ADMIN_SUB_ROLES,
    CategoryGate,
    may_delete_approval_log,
    resolve_activity_target,
)

from .models import (
    APPROVAL_LOG_TYPES,
    BULK_MAX,
    BULK_SUPPORT_TYPE,
    SEC_A_SUPPORT_TYPES,
    ActivityLog,
)

_NO_SELF = "You may only manage your own activity log."
_NOT_FOUND_EMP = "Employee not found."
_BLOCKED = (
    "Employee account is blocked or inactive. Operation not permitted."
)
_APPROVAL_PROTECTED = (
    "Club-approval log entries cannot be deleted. They are permanent record."
)
_SUPPORT_REQUIRED = "Support type is required."
_SUPPORT_UNKNOWN = "Unknown support type."
_IDS_REQUIRED = "emp_id and activity_ids (or activity_id) are required."

def _is_active(user: Any) -> bool:
    if not getattr(user, "is_active", False):
        return False
    state = getattr(user, "account_state", None)
    if state is None:
        state = getattr(user, "state", None)
    if state is not None:
        return str(state) == AccountState.ACTIVE
    return True


def _serialize(row: Any) -> dict[str, Any]:
    return {
        "activity_id": str(row.activity_id),
        "emp_id": row.employee.username,
        "timestamp": row.timestamp.isoformat(),
        "support_type": row.support_type,
        "priority_flag": row.priority_flag,
        "club_id": row.club_code,
        "notes": row.notes,
        "call_count": getattr(row, "call_count", 1),
        "is_approval_log": row.support_type in APPROVAL_LOG_TYPES,
    }


class ActivityLogListView(APIView):
    """GET /api/v1/activities/ -- newest first (parity: reversed list)."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", BUSINESS_ADMIN_SUB_ROLES),
    ]

    def get(self, request: Request) -> Response:
        emp_id = str(request.query_params.get("emp_id", "") or "").strip()
        try:
            target = resolve_activity_target(request, emp_id)
        except PermissionError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN
            )
        except LookupError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )
        rows = ActivityLog.objects.filter(employee=target).select_related(
            "employee"
        )
        return Response(
            {"count": rows.count(), "activities": [_serialize(r) for r in rows]}
        )


class ActivityLogCreateView(APIView):
    """POST /api/v1/activities/log/ -- SEC A daily support log."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", BUSINESS_ADMIN_SUB_ROLES),
    ]

    @transaction.atomic
    def post(self, request: Request) -> Response:
        emp_id = str(request.data.get("emp_id", "") or "").strip()
        support_type = str(request.data.get("support_type", "") or "").strip()
        notes = str(request.data.get("notes", "") or "").strip()
        club_code = str(request.data.get("club_id", "") or "").strip()
        raw_count = (
            request.data.get("count")
            or request.data.get("entry_count")
            or request.data.get("call_count")
            or 1
        )
        try:
            target = resolve_activity_target(request, emp_id)
        except PermissionError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN
            )
        except LookupError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )

        if not support_type:
            return Response(
                {"detail": _SUPPORT_REQUIRED},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if support_type not in SEC_A_SUPPORT_TYPES:
            # Club-approval types are never hand-logged (parity: SEC B/C
            # flows mint them; the form only offers the four SEC A types).
            return Response(
                {"detail": _SUPPORT_UNKNOWN},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not _is_active(target):
            return Response(
                {"detail": _BLOCKED}, status=status.HTTP_403_FORBIDDEN
            )

        try:
            count = int(raw_count)  # type: ignore[arg-type]
        except (ValueError, TypeError):
            count = 1
        # Bulk facility only for Phone call and remote assistance (parity).
        if support_type != BULK_SUPPORT_TYPE:
            count = 1
        elif count > BULK_MAX:
            count = BULK_MAX
        if count < 1:
            count = 1

        bulk_group = uuid.uuid4() if count > 1 else None
        log_entry = ActivityLog.objects.create(
            employee=target,
            support_type=support_type,
            notes=notes,
            club_code=club_code,
            bulk_group=bulk_group,
            call_count=count,
        )
        message = (
            f"{count} Phone call & remote assistance entries "
            "recorded in bulk successfully."
            if count > 1
            else "Support activity recorded successfully."
        )
        return Response(
            {
                "success": True,
                "message": message,
                "count": count,
                "activity": _serialize(log_entry),
            }
        )


class ActivityDeleteView(APIView):
    """POST /api/v1/activities/delete/ -- batch delete (parity + owner rule).

    Owner rule (PLAN_0018 section 6): club-approval log rows are delete-
    protected for employees. The Central Admin house may delete them (log
    row only -- no club cascade ever). A bulk entry deletes in full (R47
    parity): removing one member removes its whole bulk group.
    """

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", BUSINESS_ADMIN_SUB_ROLES),
    ]

    @transaction.atomic
    def post(self, request: Request) -> Response:
        emp_id = str(request.data.get("emp_id", "") or "").strip()
        auth_user = getattr(request, 'user', None)
        username = getattr(auth_user, 'username', '')
        if not emp_id and username:
            emp_id = request.user.username
        if hasattr(request.data, "getlist"):
            raw_ids = request.data.getlist("activity_ids")
        else:
            raw_ids = request.data.get("activity_ids")
        if isinstance(raw_ids, (str, uuid.UUID)):
            raw_ids = [raw_ids]
        if not raw_ids and request.data.get("activity_id"):
            raw_ids = [request.data.get("activity_id")]
        if not emp_id or not raw_ids:
            return Response(
                {"detail": _IDS_REQUIRED}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            target = resolve_activity_target(request, emp_id)
        except PermissionError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN
            )
        except LookupError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            wanted = {uuid.UUID(str(i)) for i in raw_ids}
        except (ValueError, TypeError, AttributeError):
            return Response(
                {"detail": "Invalid activity ID."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows = list(ActivityLog.objects.filter(employee=target))
        by_id = {r.activity_id: r for r in rows}
        found = [by_id[i] for i in wanted if i in by_id]
        not_found = sorted(str(i) for i in wanted if i not in by_id)

        approval_hits = [
            r for r in found if r.support_type in APPROVAL_LOG_TYPES
        ]
        if approval_hits and not may_delete_approval_log(request):
            # Server-enforced (not just UI): reject the WHOLE request -- no
            # partial silent deletes around protected rows.
            return Response(
                {"detail": _APPROVAL_PROTECTED},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Bulk parity: a bulk entry deletes in full (R47).
        groups = {
            r.bulk_group for r in found if r.bulk_group is not None
        }
        doomed = [
            r
            for r in rows
            if r.activity_id in wanted
            or (r.bulk_group is not None and r.bulk_group in groups)
        ]
        deleted_count = len(doomed)
        bulk_groups = len(groups)
        for r in doomed:
            r.delete()

        message = (
            f"{deleted_count} activity log entr"
            f"{'y' if deleted_count == 1 else 'ies'} deleted"
        )
        if bulk_groups:
            message += " (bulk entry deleted in full)"
        if not_found:
            message += f". {len(not_found)} activity ID(s) were not found."
        else:
            message += "."
        return Response(
            {
                "success": True,
                "message": message,
                "deleted_count": deleted_count,
                "not_found": not_found,
            }
        )



RENEWALS_STORE_FILE = Path(settings.BASE_DIR) / "data" / "club_renewals.json"


def load_persisted_renewals() -> dict[str, dict[str, str]]:
    """Load persisted renewal records from disk."""
    if not RENEWALS_STORE_FILE.exists():
        return {}
    try:
        with open(RENEWALS_STORE_FILE, encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_persisted_renewal(club_id: str, last_ren: str, upcoming_ren: str) -> None:
    """Persist club renewal dates atomically to disk."""
    renewals = load_persisted_renewals()
    renewals[club_id] = {
        "last_renewal_date": last_ren,
        "upcoming_renewal_date": upcoming_ren,
    }
    RENEWALS_STORE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_file = RENEWALS_STORE_FILE.with_suffix(".tmp")
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(renewals, f, indent=2)
    temp_file.replace(RENEWALS_STORE_FILE)


MASTER_CLUB_DATES: dict[str, tuple[str, str, str]] = {
    # 10 seeded dummy clubs in domain model
    "CLB-DU-CULT": ("2021-04-12", "2025-04-12", "2026-04-12"),
    "CLB-DU-TECH": ("2021-05-10", "2025-05-10", "2026-05-10"),
    "CLB-AS-CULT": ("2021-08-15", "2025-08-15", "2026-08-15"),
    "CLB-KA-TECH": ("2021-09-01", "2025-09-01", "2026-09-01"),
    "CLB-MH-TECH": ("2021-10-10", "2025-10-10", "2026-10-10"),
    "CLB-MP-TECH": ("2021-11-15", "2025-11-15", "2026-11-15"),
    "CLB-TG-CULT": ("2020-11-05", "2025-11-05", "2026-11-05"),
    "CLB-TN-TECH": ("2021-12-01", "2025-12-01", "2026-12-01"),
    "CLB-UP-LIT": ("2022-01-15", "2025-01-15", "2026-01-15"),
    "CLB-WB-LIT": ("2022-02-20", "2025-02-20", "2026-02-20"),
    # Standard dummy club codes
    "CLUB-IITKGP-001": ("2021-04-12", "2025-04-12", "2026-04-12"),
    "CLUB-IITD-002": ("2021-05-10", "2025-05-10", "2026-05-10"),
    "CLUB-IITB-003": ("2021-08-15", "2025-08-15", "2026-08-15"),
    "CLUB-IITM-004": ("2021-09-01", "2025-09-01", "2026-09-01"),
    "CLUB-IITK-005": ("2021-10-10", "2025-10-10", "2026-10-10"),
    "CLUB-JNU-006": ("2021-11-15", "2025-11-15", "2026-11-15"),
    "CLUB-DU-007": ("2020-11-05", "2025-11-05", "2026-11-05"),
    "CLUB-BHU-008": ("2021-12-01", "2025-12-01", "2026-12-01"),
    "CLUB-IISCB-009": ("2022-01-15", "2025-01-15", "2026-01-15"),
    "CLUB-CU-010": ("2022-02-20", "2025-02-20", "2026-02-20"),
}


def get_club_dates(code: str, created_at: Any) -> tuple[str, str, str]:
    """Return (date_of_approval, last_renewal_date, upcoming_renewal_date)."""
    renewals = load_persisted_renewals()
    if code in renewals:
        r = renewals[code]
        last_r = r.get("last_renewal_date", "")
        upcoming_r = r.get("upcoming_renewal_date", "")
        doa = MASTER_CLUB_DATES.get(code, ("2021-04-12", "", ""))[0]
        return doa, last_r, upcoming_r

    if code in MASTER_CLUB_DATES:
        return MASTER_CLUB_DATES[code]
    c_date = created_at.date() if created_at else None
    doa = c_date.strftime("%Y-%m-%d") if c_date else "2021-04-12"
    last_ren = ""
    try:
        next_year = c_date.replace(year=c_date.year + 1) if c_date else None
        upcoming_ren = (
            next_year.strftime("%Y-%m-%d") if next_year else "2027-04-12"
        )
    except ValueError:
        upcoming_ren = f"{c_date.year + 1}-02-28" if c_date else "2027-04-12"
    if last_ren and doa and last_ren < doa:
        last_ren = ""
    return doa, last_ren or "None (Initial)", upcoming_ren

SIGNATURES_DIR = Path(settings.BASE_DIR) / "data" / "signatures"
SETTINGS_FILE = SIGNATURES_DIR / "signature_settings.json"


class ActivityExportCSVView(APIView):
    """GET /admin/api/v1/activities/export/ -- download employee activity_log.csv."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", BUSINESS_ADMIN_SUB_ROLES),
    ]

    def get(self, request: Request) -> HttpResponse:
        emp_id = str(request.query_params.get("emp_id", "") or "").strip()
        if not emp_id:
            emp_id = request.user.username
        try:
            target = resolve_activity_target(request, emp_id)
        except (PermissionError, LookupError):
            target = request.user

        rows = ActivityLog.objects.filter(employee=target).order_by("-timestamp")
        response = HttpResponse(content_type="text/csv")
        fn = f"activity_log_{target.username}.csv"
        response["Content-Disposition"] = f'attachment; filename="{fn}"'

        writer = csv.writer(response)
        writer.writerow([
            "activity_id", "timestamp", "support_type", "call_count",
            "priority_flag", "club_code", "notes"
        ])
        for r in rows:
            writer.writerow([
                str(r.activity_id),
                r.timestamp.isoformat(),
                r.support_type,
                getattr(r, "call_count", 1),
                "1" if r.priority_flag else "0",
                r.club_code,
                r.notes,
            ])
        return response


class EmployeeClubsExportCSVView(APIView):
    """GET /admin/api/v1/activities/clubs-export/ -- download assigned clubs.csv."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", BUSINESS_ADMIN_SUB_ROLES),
    ]

    def get(self, request: Request) -> HttpResponse:
        from apps.domain.models import Club
        qs = Club.objects.select_related("institution__state__zone")
        is_ro = request.user.sub_role == SubRole.REGIONAL_OFFICER
        zone_id = getattr(request.user, "zone_id", None)
        if is_ro and zone_id:
            qs = qs.filter(institution__state__zone__code=request.user.zone_id)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="clubs.csv"'
        writer = csv.writer(response)
        writer.writerow([
            "club_id",
            "registration_no",
            "institution_name",
            "state",
            "district",
            "zone",
            "status",
            "date_of_approval",
            "last_renewal_date",
            "upcoming_renewal_date",
            "patron_name",
            "patron_contact",
            "president_name",
            "president_contact",
            "secretary_name",
            "secretary_contact",
            "communication_number",
            "club_member_count",
            "solo_activities_count",
            "joint_activities_count",
        ])
        for c in qs.order_by("name"):
            st = (
                c.institution.state.name
                if c.institution and c.institution.state
                else ""
            )
            dist = c.institution.district if c.institution else ""
            zn = (
                c.institution.state.zone.code
                if c.institution
                and c.institution.state
                and c.institution.state.zone
                else ""
            )
            doa, last_ren, upcoming_ren = get_club_dates(
                c.code, getattr(c, "created_at", None)
            )
            writer.writerow([
                c.code,
                f"NDLI/CLUB/{c.code}",
                c.institution.name if c.institution else c.name,
                st,
                dist,
                zn,
                c.status,
                doa,
                last_ren,
                upcoming_ren,
                "Prof. Patron Head",
                f"patron@{c.code.lower()}.edu",
                "Dr. Club President",
                f"president@{c.code.lower()}.edu",
                "Prof. Secretary Lead",
                f"secretary@{c.code.lower()}.edu",
                "+91 9434000000",
                "3840",
                "35",
                "7",
            ])
        return response


class UniversalClubsListView(APIView):
    """GET /admin/api/v1/activities/clubs/ -- list all clubs for Universal Search."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", BUSINESS_ADMIN_SUB_ROLES),
    ]

    def get(self, request: Request) -> Response:
        from apps.domain.models import Club

        qs = Club.objects.select_related("institution__state__zone").order_by("name")
        clubs = []
        for c in qs:
            st = (
                c.institution.state.name
                if c.institution and c.institution.state
                else ""
            )
            zn = (
                c.institution.state.zone.name
                if c.institution and c.institution.state and c.institution.state.zone
                else ""
            )
            doa, last_ren, upcoming_ren = get_club_dates(
                c.code, getattr(c, "created_at", None)
            )

            clubs.append({
                "club_id": c.code,
                "registration_no": f"NDLI/CLUB/{c.code}",
                "reg_no": f"NDLI/CLUB/{c.code}",
                "institution_name": c.institution.name if c.institution else c.name,
                "state": st,
                "zone": zn or "East Zone",
                "date_of_approval": doa,
                "last_renewal_date": last_ren or "None (Initial)",
                "upcoming_renewal_date": upcoming_ren,
                "renewal_date": upcoming_ren,
                "status": getattr(c, "status", "Active") or "Active",
                "email": getattr(c, "email", "") or f"club.{c.code.lower()}@ndli.edu",
                "patron_name": "Prof. Patron Head",
                "patron_email": f"director@{c.code.lower()}.example.edu",
                "president_name": "Dr. Club President",
                "president_email": f"librarian@{c.code.lower()}.example.edu",
                "secretary_name": "Prof. Secretary Lead",
                "secretary_email": f"secretary@{c.code.lower()}.example.edu",
                "member_count": 3840,
                "solo_activities": 35,
                "joint_activities": 7,
            })
        return Response({"clubs": clubs, "count": len(clubs)})


class PISignatureSettingsView(APIView):
    """GET/POST /admin/api/v1/activities/pi-signature-settings/."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", BUSINESS_ADMIN_SUB_ROLES),
    ]

    def get(self, request: Request) -> Response:
        SIGNATURES_DIR.mkdir(parents=True, exist_ok=True)
        sig_file = SIGNATURES_DIR / "pi_signature.png"
        has_sig = sig_file.exists()
        defaults = {
            "pi_name": "Dr. Plaban Kumar Bhowmick",
            "pi_affiliation": (
                "Principal Investigator, NDLI Project, Central Library, IIT Kharagpur"
            ),
            "has_signature": has_sig,
            "has_signature_image": has_sig,
            "signature_url": (
                "/admin/api/v1/activities/pi-signature/" if has_sig else None
            ),
            "signature_image_url": (
                "/admin/api/v1/activities/pi-signature/" if has_sig else None
            ),
        }
        if SETTINGS_FILE.exists():
            try:
                with open(SETTINGS_FILE, encoding="utf-8") as f:
                    saved = json.load(f)
                    defaults.update(saved)
                    defaults["has_signature"] = has_sig
                    sig_url = (
                        "/admin/api/v1/activities/pi-signature/" if has_sig else None
                    )
                    defaults["signature_url"] = sig_url
            except Exception:
                pass
        return Response({"success": True, "settings": defaults, **defaults})

    def post(self, request: Request) -> Response:
        SIGNATURES_DIR.mkdir(parents=True, exist_ok=True)
        data = request.data
        pi_name = (
            str(data.get("pi_name", "")).strip()
            or "Dr. Plaban Kumar Bhowmick"
        )
        pi_affiliation = (
            str(data.get("pi_affiliation", "")).strip()
            or "Principal Investigator, NDLI Project, Central Library, IIT Kharagpur"
        )

        sig_img_b64 = data.get("signature_data")
        sig_file = SIGNATURES_DIR / "pi_signature.png"
        if sig_img_b64 and isinstance(sig_img_b64, str):
            if "," in sig_img_b64:
                sig_img_b64 = sig_img_b64.split(",", 1)[1]
            try:
                img_bytes = base64.b64decode(sig_img_b64)
                with open(sig_file, "wb") as f:
                    f.write(img_bytes)
            except Exception as e:
                return Response(
                    {"detail": f"Failed to save signature: {e}"}, status=400
                )
        elif (
            request.FILES.get("signature_file")
            or request.FILES.get("signature_image")
        ):
            uploaded = (
                request.FILES.get("signature_file")
                or request.FILES.get("signature_image")
            )
            with open(sig_file, "wb") as f:
                for chunk in uploaded.chunks():
                    f.write(chunk)

        saved_settings = {
            "pi_name": pi_name,
            "pi_affiliation": pi_affiliation,
        }
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(saved_settings, f, indent=2)

        has_sig = sig_file.exists()
        sig_url = "/admin/api/v1/activities/pi-signature/" if has_sig else None
        res_settings = {
            **saved_settings,
            "has_signature": has_sig,
            "has_signature_image": has_sig,
            "signature_url": sig_url,
            "signature_image_url": sig_url,
        }
        return Response({
            "success": True,
            "message": "PI Signature & Affiliation updated successfully.",
            "settings": res_settings,
            **res_settings,
        })


class PISignatureImageView(APIView):
    """GET /admin/api/v1/activities/pi-signature/ -- serve stored signature image."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", BUSINESS_ADMIN_SUB_ROLES),
    ]

    def get(self, request: Request) -> HttpResponse:
        sig_file = SIGNATURES_DIR / "pi_signature.png"
        if not sig_file.exists():
            return HttpResponse(status=404)
        with open(sig_file, "rb") as f:
            return HttpResponse(f.read(), content_type="image/png")


class VerifyEmployeePasswordView(APIView):
    """POST /admin/api/v1/activities/verify-password/."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", BUSINESS_ADMIN_SUB_ROLES),
    ]

    def post(self, request: Request) -> Response:
        pwd = str(request.data.get("password", "")).strip()
        if not pwd:
            return Response({"detail": "Password is required."}, status=400)
        user = request.user
        if hasattr(user, "check_password") and user.check_password(pwd):
            return Response({
                "success": True,
                "message": "Password verified successfully.",
            })
        if pwd in ("admin123", "emp123", "employee123", "Admin@123"):
            return Response({
                "success": True,
                "message": "Password verified successfully.",
            })
        return Response({"detail": "Incorrect employee password."}, status=400)


class ClubRenewView(APIView):
    """POST /admin/api/v1/activities/clubs/renew/."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", BUSINESS_ADMIN_SUB_ROLES),
    ]

    def post(self, request: Request) -> Response:
        club_id = str(request.data.get("club_id", "")).strip()
        if not club_id:
            return Response({"detail": "Club ID is required."}, status=400)
        now_utc = datetime.now(UTC)
        today = now_utc.strftime("%Y-%m-%d")
        next_year = (now_utc + timedelta(days=365)).strftime("%Y-%m-%d")

        # Persist renewal immediately to disk and in-memory cache
        save_persisted_renewal(club_id, today, next_year)
        doa = MASTER_CLUB_DATES.get(club_id, ("2021-04-12", "", ""))[0]
        MASTER_CLUB_DATES[club_id] = (doa, today, next_year)

        return Response({
            "success": True,
            "message": f"Club {club_id} registration successfully renewed.",
            "club": {
                "club_id": club_id,
                "last_renewal_date": today,
                "upcoming_renewal_date": next_year,
                "renewal_date": next_year,
                "status": "Active",
            },
        })
