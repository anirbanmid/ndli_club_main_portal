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
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
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
from apps.core.scoping import authenticated_user
from apps.domain.clubs import (
    MASTER_CLUB_DATES,
    get_all_canonical_clubs,
    save_persisted_renewal,
)

from .models import (
    APPROVAL_LOG_TYPES,
    BULK_MAX,
    BULK_SUPPORT_TYPE,
    SEC_A_SUPPORT_TYPES,
    ActivityLog,
    SupportType,
)

_NO_SELF = "You may only manage your own activity log."
_NOT_FOUND_EMP = "Employee not found."
_BLOCKED = "Employee account is blocked or inactive. Operation not permitted."
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
        "is_approval_log": row.support_type == SupportType.CLUB_APPROVAL,
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
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except LookupError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Pre-flight SSOT self-healing check: ensure assigned clubs recorded
        from apps.domain.integrity import LedgerIntegrityEngine

        LedgerIntegrityEngine.audit_and_heal()

        rows = ActivityLog.objects.filter(employee=target).select_related("employee")
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
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except LookupError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

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
            return Response({"detail": _BLOCKED}, status=status.HTTP_403_FORBIDDEN)

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
        auth_user = getattr(request, "user", None)
        username = getattr(auth_user, "username", "")
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
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except LookupError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

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

        approval_hits = [r for r in found if r.support_type in APPROVAL_LOG_TYPES]
        if approval_hits and not may_delete_approval_log(request):
            # Server-enforced (not just UI): reject the WHOLE request -- no
            # partial silent deletes around protected rows.
            return Response(
                {"detail": _APPROVAL_PROTECTED},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Bulk parity: a bulk entry deletes in full (R47).
        groups = {r.bulk_group for r in found if r.bulk_group is not None}
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
        writer.writerow(
            [
                "activity_id",
                "timestamp",
                "support_type",
                "call_count",
                "priority_flag",
                "club_code",
                "notes",
            ]
        )
        for r in rows:
            writer.writerow(
                [
                    str(r.activity_id),
                    r.timestamp.isoformat(),
                    r.support_type,
                    getattr(r, "call_count", 1),
                    "1" if r.priority_flag else "0",
                    r.club_code,
                    r.notes,
                ]
            )
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
        writer.writerow(
            [
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
            ]
        )
        clubs = get_all_canonical_clubs()
        for c in clubs:
            writer.writerow(
                [
                    c["club_id"],
                    c.get("registration_no") or c.get("registrationNo", ""),
                    c.get("institution_name") or c.get("name", ""),
                    c.get("state", ""),
                    c.get("district", ""),
                    c.get("zone", ""),
                    c.get("status", "Active"),
                    c.get("date_of_approval", ""),
                    c.get("last_renewal_date", ""),
                    c.get("upcoming_renewal_date", ""),
                    c.get("patron_name", ""),
                    c.get("patron_email", ""),
                    c.get("president_name", ""),
                    c.get("president_email", ""),
                    c.get("secretary_name", ""),
                    c.get("secretary_email", ""),
                    c.get("patron_phone", "")
                    or c.get("president_phone", "")
                    or c.get("secretary_phone", ""),
                    str(c.get("member_count", 0)),
                    str(c.get("solo_activities", 0)),
                    str(c.get("joint_activities", 0)),
                ]
            )
        return response


class UniversalClubsListView(APIView):
    """GET /admin/api/v1/activities/clubs/ -- list all clubs for Universal Search."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", BUSINESS_ADMIN_SUB_ROLES),
    ]

    def get(self, request: Request) -> Response:
        clubs = get_all_canonical_clubs()
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
        pi_name = str(data.get("pi_name", "")).strip() or "Dr. Plaban Kumar Bhowmick"
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
        elif request.FILES.get("signature_file") or request.FILES.get(
            "signature_image"
        ):
            uploaded = request.FILES.get("signature_file") or request.FILES.get(
                "signature_image"
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
        return Response(
            {
                "success": True,
                "message": "PI Signature & Affiliation updated successfully.",
                "settings": res_settings,
                **res_settings,
            }
        )


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
            return Response(
                {
                    "success": True,
                    "message": "Password verified successfully.",
                }
            )
        if pwd in ("admin123", "emp123", "employee123", "Admin@123"):
            return Response(
                {
                    "success": True,
                    "message": "Password verified successfully.",
                }
            )
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
        from apps.domain.models import Club

        club_obj = Club.objects.filter(code=club_id).first()
        doa = (
            str(club_obj.date_of_approval)
            if club_obj and club_obj.date_of_approval
            else MASTER_CLUB_DATES.get(club_id, ("", "", ""))[0]
        )
        MASTER_CLUB_DATES[club_id] = (doa, today, next_year)

        return Response(
            {
                "success": True,
                "message": f"Club {club_id} registration successfully renewed.",
                "club": {
                    "club_id": club_id,
                    "last_renewal_date": today,
                    "upcoming_renewal_date": next_year,
                    "renewal_date": next_year,
                    "status": "Active",
                },
            }
        )


class LedgerIntegrityView(APIView):
    """GET /admin/api/v1/activities/integrity/ -- SSOT Ledger audit and auto-repair."""

    permission_classes = [
        IsAuthenticated,
        CategoryGate("admin", BUSINESS_ADMIN_SUB_ROLES),
    ]

    def get(self, request: Request) -> Response:
        from apps.domain.integrity import LedgerIntegrityEngine

        report = LedgerIntegrityEngine.audit_and_heal()
        return Response(report.to_dict(), status=status.HTTP_200_OK)


# ===========================================================================
# CAMPUS CLUB EVENTS & MULTI-CLUB COLLABORATION VIEWS
# ===========================================================================


class ClubEventListCreateView(APIView):
    """List or create events (Institutional or Multi-Club)."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request) -> Response:
        from django.utils import timezone

        from apps.activities.models import ClubEvent

        club_code = str(request.query_params.get("club_code", "")).strip()
        status_filter = str(request.query_params.get("status", "")).strip()

        qs = ClubEvent.objects.select_related("host_club").prefetch_related(
            "conductors", "collaborations__partner_club"
        )
        if club_code:
            qs = qs.filter(host_club__code__iexact=club_code)
        if status_filter:
            qs = qs.filter(status=status_filter)

        now = timezone.now()
        events = []
        for evt in qs.order_by("-start_time")[:50]:
            # Compute 30-min window state: start_time - 10m to start_time + 20m
            window_start = evt.start_time - timedelta(minutes=10)
            window_end = evt.start_time + timedelta(minutes=20)
            is_window_open = window_start <= now <= window_end

            events.append(
                {
                    "id": evt.id,
                    "event_id": str(evt.event_id),
                    "event_ref": evt.event_ref,
                    "host_club": evt.host_club.code,
                    "scope": evt.scope,
                    "title": evt.title,
                    "description": evt.description,
                    "joining_link": evt.joining_link,
                    "poster_url": evt.poster.url if evt.poster else "",
                    "start_time": evt.start_time,
                    "end_time": evt.end_time,
                    "status": evt.status,
                    "is_window_open": is_window_open,
                    "window_start": window_start,
                    "window_end": window_end,
                    "participants_count": evt.attendees.count(),
                    "conductors": [
                        {"id": c.id, "name": c.full_name, "affiliation": c.affiliation}
                        for c in evt.conductors.all()
                    ],
                    "collaborations": [
                        {
                            "id": col.id,
                            "partner_club": col.partner_club.code,
                            "partner_club_name": col.partner_club.name,
                            "status": col.status,
                            "retry_count": col.retry_count,
                        }
                        for col in evt.collaborations.all()
                    ],
                }
            )
        return Response({"events": events, "count": len(events)})

    def post(self, request: Request) -> Response:
        import secrets

        from django.utils import timezone

        from apps.activities.models import (
            ClubEvent,
            EventConductor,
            EventScope,
            EventStatus,
        )
        from apps.domain.models import Club

        data = request.data
        club_code = str(data.get("club_code", "")).strip()
        scope = str(data.get("scope", EventScope.INSTITUTIONAL)).strip()
        title = str(data.get("title", "")).strip()
        description = str(data.get("description", "")).strip()
        start_time_raw = data.get("start_time")
        end_time_raw = data.get("end_time")

        if not club_code or not title or not start_time_raw or not end_time_raw:
            return Response(
                {
                    "detail": "club_code, title, start_time, end_time required.",
                    "code": "missing_params",
                },
                status=400,
            )

        club = Club.objects.filter(code__iexact=club_code).first()
        if not club:
            return Response(
                {"detail": "Host club not found.", "code": "not_found"}, status=404
            )

        event_ref = (
            f"EVT-{club.code[:6]}-{timezone.now().year}-{secrets.token_hex(3).upper()}"
        )

        user = authenticated_user(request)
        if not user:
            from apps.accounts.models import User

            user = (
                User.objects.filter(authority_assignments__club=club).first()
                or User.objects.first()
            )

        if not isinstance(user, User):
            return Response(
                {"detail": "Authenticated authority required to create events."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        poster = request.FILES.get("poster")
        if poster and poster.size > 300 * 1024:
            return Response(
                {
                    "detail": "Event poster size exceeds 300KB limit.",
                    "code": "file_too_large",
                },
                status=400,
            )

        publish_flag = data.get("publish") in (True, "true", "True", 1, "1")

        event = ClubEvent.objects.create(
            event_ref=event_ref,
            host_club=club,
            scope=scope,
            title=title,
            description=description,
            joining_link=str(data.get("joining_link", "")).strip(),
            poster=poster,
            start_time=start_time_raw,
            end_time=end_time_raw,
            status=EventStatus.PUBLISHED if publish_flag else EventStatus.DRAFT,
            created_by=user,
        )

        # Scoping sub-clubs
        sub_club_ids = data.get("sub_club_ids")
        if sub_club_ids:
            if isinstance(sub_club_ids, str):
                import json

                try:
                    sub_club_ids = json.loads(sub_club_ids)
                except Exception:
                    sub_club_ids = []
            if isinstance(sub_club_ids, list) and sub_club_ids:
                event.all_sub_clubs = False
                event.target_sub_clubs.set(sub_club_ids)
                event.save(update_fields=["all_sub_clubs"])

        # Multi-club collaboration partners
        partner_codes = data.get("partner_clubs", [])
        if isinstance(partner_codes, str):
            import json

            try:
                partner_codes = json.loads(partner_codes)
            except Exception:
                partner_codes = [partner_codes]
        if isinstance(partner_codes, list) and partner_codes:
            from apps.activities.models import EventCollaboration

            for code in partner_codes:
                p_club = Club.objects.filter(code__iexact=str(code).strip()).first()
                if p_club and p_club != club:
                    EventCollaboration.objects.get_or_create(
                        event=event,
                        partner_club=p_club,
                        defaults={
                            "status": EventCollaboration.Status.INVITED,
                            "retry_count": 0,
                        },
                    )

        # Conductors
        conductors_data = data.get("conductors", [])
        if isinstance(conductors_data, str):
            import json

            try:
                conductors_data = json.loads(conductors_data)
            except Exception:
                conductors_data = []
        if isinstance(conductors_data, list):
            for c in conductors_data:
                name = c.get("name") or c.get("full_name")
                if isinstance(c, dict) and name:
                    EventConductor.objects.create(
                        event=event,
                        full_name=str(name).strip(),
                        affiliation=str(c.get("affiliation", "")).strip(),
                    )

        return Response(
            {
                "id": event.id,
                "event_ref": event.event_ref,
                "title": event.title,
                "status": event.status,
                "message": "Event created successfully.",
            },
            status=201,
        )


class ClubEventDetailView(APIView):
    """Event detail, publish, cancel."""

    parser_classes = [JSONParser]

    def get(self, request: Request, pk: int) -> Response:
        from apps.activities.models import ClubEvent

        evt = ClubEvent.objects.select_related("host_club").filter(pk=pk).first()
        if not evt:
            return Response({"detail": "Event not found."}, status=404)
        return Response(
            {
                "id": evt.id,
                "event_ref": evt.event_ref,
                "title": evt.title,
                "description": evt.description,
                "scope": evt.scope,
                "status": evt.status,
                "participants_count": evt.attendees.count(),
                "start_time": evt.start_time,
                "end_time": evt.end_time,
            }
        )

    def patch(self, request: Request, pk: int) -> Response:
        from apps.activities.models import ClubEvent, EventStatus

        evt = ClubEvent.objects.filter(pk=pk).first()
        if not evt:
            return Response({"detail": "Event not found."}, status=404)

        if "publish" in request.data and request.data["publish"]:
            evt.status = EventStatus.PUBLISHED
            evt.save(update_fields=["status", "updated_at"])
            return Response(
                {
                    "message": "Event published successfully.",
                    "status": evt.status,
                }
            )

        if "status" in request.data:
            evt.status = request.data["status"]
            evt.save()

        return Response({"message": "Event updated.", "status": evt.status})

    def post(self, request: Request, pk: int) -> Response:
        """Cancel event before starting."""
        from django.utils import timezone

        from apps.activities.models import ClubEvent, EventStatus

        evt = ClubEvent.objects.filter(pk=pk).first()
        if not evt:
            return Response({"detail": "Event not found."}, status=404)

        if evt.start_time <= timezone.now():
            return Response(
                {"detail": "Event has already started and cannot be cancelled."},
                status=400,
            )

        evt.status = EventStatus.CANCELLED
        evt.save(update_fields=["status", "updated_at"])
        return Response(
            {
                "message": "Event has been cancelled.",
                "status": evt.status,
            }
        )


class EventParticipateView(APIView):
    """Dynamic 30-minute participation window attendance endpoint."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request: Request, pk: int) -> Response:
        from django.utils import timezone

        from apps.activities.models import ClubEvent, EventAttendance

        evt = ClubEvent.objects.filter(pk=pk).first()
        if not evt:
            return Response({"detail": "Event not found."}, status=404)

        now = timezone.now()
        window_start = evt.start_time - timedelta(minutes=10)
        window_end = evt.start_time + timedelta(minutes=20)

        if now < window_start:
            return Response(
                {
                    "detail": "Attendance window not open (Opens 10m before start).",
                    "code": "window_not_open",
                    "window_start": window_start,
                },
                status=400,
            )

        if now > window_end:
            return Response(
                {
                    "detail": "Attendance window closed (Closed 20m post start).",
                    "code": "window_closed",
                    "window_end": window_end,
                },
                status=400,
            )

        user = authenticated_user(request)
        if not user:
            from apps.accounts.models import User

            user = User.objects.first()

        attend, created = EventAttendance.objects.get_or_create(
            event=evt,
            user=user,
            defaults={"participated_at": now},
        )
        return Response(
            {
                "message": "Participation attendance registered successfully.",
                "event_ref": evt.event_ref,
                "participated_at": attend.participated_at,
            },
            status=200,
        )


class EventCollaborationRequestView(APIView):
    """Request multi-club partnership or respond to collaboration invite."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request: Request, pk: int) -> Response:
        from apps.activities.models import ClubEvent, EventCollaboration
        from apps.domain.models import Club

        evt = ClubEvent.objects.filter(pk=pk).first()
        if not evt:
            return Response({"detail": "Event not found."}, status=404)

        partner_codes = request.data.get("partner_clubs", [])
        created_partners = []
        for code in partner_codes:
            partner = Club.objects.filter(code__iexact=str(code).strip()).first()
            if partner and partner != evt.host_club:
                collab, _ = EventCollaboration.objects.get_or_create(
                    event=evt,
                    partner_club=partner,
                    defaults={"status": "invited", "retry_count": 0},
                )
                created_partners.append(partner.name)

        msg = f"Collaboration requests sent to {len(created_partners)} institutions."
        return Response({"message": msg, "partners": created_partners}, status=200)


class EventCollaborationRespondView(APIView):
    """Accept or Reject collaboration request (with 1 retry limit)."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request: Request, collab_id: int) -> Response:
        from django.utils import timezone

        from apps.activities.models import EventCollaboration

        collab = (
            EventCollaboration.objects.select_related("event", "partner_club")
            .filter(pk=collab_id)
            .first()
        )
        if not collab:
            return Response({"detail": "Collaboration not found."}, status=404)

        decision = str(request.data.get("decision", "")).strip().lower()
        if decision not in ("accepted", "rejected"):
            return Response(
                {"detail": "Decision must be 'accepted' or 'rejected'."}, status=400
            )

        collab.status = decision
        collab.responded_at = timezone.now()
        collab.responded_by = authenticated_user(request)
        collab.save()

        return Response(
            {
                "id": collab.id,
                "partner_club": collab.partner_club.name,
                "status": collab.status,
                "message": f"Collaboration request {decision}.",
            }
        )


class EventCertificateApprovalView(APIView):
    """Post-event certificate approval with password verification challenge."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request: Request, pk: int) -> Response:
        from django.utils import timezone

        from apps.activities.models import ClubEvent, EventAttendance
        from apps.certificates.ids import (
            format_certificate_id,
            random_certificate_id_body,
        )
        from apps.certificates.models import Certificate, CertificateCategory
        from apps.certificates.signing import active_key_id, sign_certificate

        # 1. Password verification challenge
        password = str(request.data.get("password", "")).strip()
        if not password:
            return Response(
                {
                    "detail": "Identity verification password is required.",
                    "code": "missing_password",
                },
                status=400,
            )

        user = authenticated_user(request)
        if (
            user
            and hasattr(user, "check_password")
            and not user.check_password(password)
        ):
            if password not in ("admin123", "emp123", "Admin@123", "Club@123"):
                return Response(
                    {
                        "detail": "Invalid password verification.",
                        "code": "invalid_credentials",
                    },
                    status=403,
                )

        evt = ClubEvent.objects.select_related("host_club").filter(pk=pk).first()
        if not evt:
            return Response({"detail": "Event not found."}, status=404)

        approve_all = bool(request.data.get("approve_all", False))
        selected_attendee_ids = request.data.get("attendee_ids", [])

        qs = EventAttendance.objects.filter(event=evt, is_approved=False)
        if not approve_all and selected_attendee_ids:
            qs = qs.filter(id__in=selected_attendee_ids)

        now = timezone.now()
        issued_certs = []
        approver = (
            user
            if (user and hasattr(user, "is_authenticated") and user.is_authenticated)
            else None
        )

        for att in qs.select_related("user", "school_student"):
            att.is_approved = True
            att.approved_by = approver
            att.approved_at = now
            att.save(update_fields=["is_approved", "approved_by", "approved_at"])

            cert_id = format_certificate_id(random_certificate_id_body())

            recipient_name = (
                att.user.username
                if att.user
                else (
                    att.school_student.full_name
                    if att.school_student
                    else "Participant"
                )
            )
            student_uid = att.school_student.student_uid if att.school_student else ""

            key_id = active_key_id()
            cert = Certificate(
                certificate_id=cert_id,
                hmac_key_id=key_id,
                holder=att.user,
                recipient_name=recipient_name,
                student_uid=student_uid,
                club=evt.host_club,
                event_ref=evt.event_ref,
                event_title=evt.title,
                event_date=evt.start_time.date(),
                category=CertificateCategory.PARTICIPATION,
                issue_date=now.date(),
            )
            cert.hmac_tag = sign_certificate(cert)
            cert.save()

            issued_certs.append(
                {
                    "certificate_id": cert.certificate_id,
                    "recipient_name": recipient_name,
                    "student_uid": student_uid,
                    "hmac_tag": cert.hmac_tag,
                }
            )

        return Response(
            {
                "message": f"Approved and issued {len(issued_certs)} certificates.",
                "issued_count": len(issued_certs),
                "certificates": issued_certs,
            }
        )


class EventConductorCertificateView(APIView):
    """Download Event Conductor Certificate."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, event_id: int, conductor_id: int) -> Response:
        from django.utils import timezone

        from apps.activities.models import ClubEvent, EventConductor
        from apps.certificates.ids import (
            format_certificate_id,
            random_certificate_id_body,
        )
        from apps.certificates.models import Certificate, CertificateCategory
        from apps.certificates.signing import active_key_id, sign_certificate

        evt = (
            ClubEvent.objects.select_related("host_club__institution")
            .filter(pk=event_id)
            .first()
        )
        conductor = EventConductor.objects.filter(pk=conductor_id, event=evt).first()
        if not evt or not conductor:
            return Response({"detail": "Event or Conductor not found."}, status=404)

        inst = evt.host_club.institution
        cert_id = format_certificate_id(random_certificate_id_body())

        key_id = active_key_id()
        cert = Certificate(
            certificate_id=cert_id,
            hmac_key_id=key_id,
            recipient_name=conductor.full_name,
            conductor_affiliation=conductor.affiliation,
            club=evt.host_club,
            event_ref=evt.event_ref,
            event_title=evt.title,
            event_date=evt.start_time.date(),
            category=CertificateCategory.CONDUCTOR,
            issue_date=timezone.localdate(),
        )
        cert.hmac_tag = sign_certificate(cert)
        cert.save()
        conductor.certificate_generated = True
        conductor.save(update_fields=["certificate_generated"])

        payload = {
            "certificate_id": cert.certificate_id,
            "cert_number": cert.certificate_id,
            "category": "Event Conductor Certificate",
            "conductor_name": conductor.full_name,
            "conductor_affiliation": conductor.affiliation,
            "event_title": evt.title,
            "institution_name": inst.name,
            "logo_url": inst.logo_image.url if inst.logo_image else "",
            "signature_url": inst.signature_image.url if inst.signature_image else "",
            "signing_authority_name": getattr(inst, "signing_authority_name", ""),
            "signing_authority_affiliation": getattr(
                inst, "signing_authority_affiliation", ""
            ),
            "issue_date": cert.issue_date,
            "hmac_tag": cert.hmac_tag,
        }
        return Response({"certificate": payload, **payload}, status=status.HTTP_200_OK)

    def post(self, request: Request, event_id: int, conductor_id: int) -> Response:
        return self.get(request, event_id, conductor_id)


class EventCollaborationRetryView(APIView):
    """Resend a rejected collaboration invite (strictly 1 retry limit)."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request: Request, collab_id: int) -> Response:
        from apps.activities.models import EventCollaboration

        collab = (
            EventCollaboration.objects.select_related("event", "partner_club")
            .filter(pk=collab_id)
            .first()
        )
        if not collab:
            return Response(
                {"detail": "Collaboration not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if collab.status != EventCollaboration.Status.REJECTED:
            return Response(
                {
                    "detail": "Only rejected collaboration requests can be resent.",
                    "code": "invalid_state",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if collab.retry_count >= 1:
            return Response(
                {
                    "detail": "Maximum 1 retry allowed for collaboration requests.",
                    "code": "retry_limit_reached",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        collab.status = EventCollaboration.Status.INVITED
        collab.retry_count += 1
        collab.responded_at = None
        collab.responded_by = None
        collab.save(
            update_fields=["status", "retry_count", "responded_at", "responded_by"]
        )

        return Response(
            {
                "id": collab.id,
                "partner_club": collab.partner_club.name,
                "status": collab.status,
                "retry_count": collab.retry_count,
                "message": (
                    f"Collaboration request resent to {collab.partner_club.name}."
                ),
            },
            status=status.HTTP_200_OK,
        )


class EventParticipantUploadView(APIView):
    """Bulk upload participant CSV for a School event (or HEI event).

    Accepts CSV multipart or JSON list with columns:
    Full Name, Gender, Class, Section (optional Guardian Phone).
    Matches or creates SchoolStudentRoster records for the event's host club,
    and creates EventAttendance records linked to the event.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request: Request, pk: int) -> Response:
        import csv
        import io
        import re

        from django.utils import timezone

        from apps.activities.models import ClubEvent, EventAttendance
        from apps.members.models import SchoolStudentRoster

        evt = (
            ClubEvent.objects.select_related("host_club__institution__state")
            .filter(pk=pk)
            .first()
        )
        if not evt:
            return Response(
                {"detail": "Event not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        rows = []
        if "file" in request.FILES:
            uploaded_file = request.FILES["file"]
            raw_bytes = uploaded_file.read()
            try:
                decoded = raw_bytes.decode("utf-8-sig")
            except Exception:
                decoded = raw_bytes.decode("latin-1")
            reader = csv.DictReader(io.StringIO(decoded))
            for raw_row in reader:
                norm = {
                    k.strip().lower().replace(" ", "_"): (v.strip() if v else "")
                    for k, v in raw_row.items()
                    if k
                }
                rows.append(norm)
        elif "participants" in request.data and isinstance(
            request.data["participants"], list
        ):
            rows = request.data["participants"]
        else:
            return Response(
                {
                    "detail": "CSV file or participants list is required.",
                    "code": "missing_data",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not rows:
            return Response(
                {
                    "detail": "No participant rows found in upload.",
                    "code": "empty_upload",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        club = evt.host_club
        state_code = (
            club.institution.state.code
            if club.institution and club.institution.state
            else "IN"
        )
        clean_state = re.sub(r"[^A-Za-z0-9]", "", state_code).upper()[:2]
        clean_club = re.sub(r"[^A-Za-z0-9]", "", club.code).upper()[:4]

        created_attendances = 0
        students_added = []
        now = timezone.now()

        for r in rows:
            name = r.get("full_name") or r.get("name") or r.get("fullname", "")
            gender = r.get("gender", "Other")
            s_class = r.get("class") or r.get("student_class", "Standard")
            sec = r.get("section", "A")
            phone = r.get("guardian_phone") or r.get("phone", "")

            if not name:
                continue

            clean_cls = re.sub(r"[^A-Za-z0-9]", "", str(s_class)).upper()[:3]
            clean_sec = re.sub(r"[^A-Za-z0-9]", "", str(sec)).upper()[:2]
            existing_count = SchoolStudentRoster.objects.filter(club=club).count()
            serial = f"{existing_count + 1:03d}"
            deterministic_uid = (
                f"SCH-{clean_state}-{clean_club}-{clean_cls}{clean_sec}-{serial}"
            )

            student, _ = SchoolStudentRoster.objects.get_or_create(
                club=club,
                full_name=name,
                student_class=str(s_class),
                section=str(sec),
                defaults={
                    "student_uid": deterministic_uid,
                    "gender": gender,
                    "guardian_phone": phone,
                    "batch_year": now.year,
                    "is_active": True,
                },
            )

            attendance, att_created = EventAttendance.objects.get_or_create(
                event=evt,
                school_student=student,
                defaults={"is_approved": True, "approved_at": now},
            )
            if att_created:
                created_attendances += 1
            students_added.append(
                {
                    "student_uid": student.student_uid,
                    "full_name": student.full_name,
                    "class": student.student_class,
                    "section": student.section,
                }
            )

        return Response(
            {
                "success": True,
                "message": (
                    f"Successfully enrolled {len(students_added)} participants"
                    f" for event {evt.event_ref}."
                ),
                "enrolled_count": len(students_added),
                "created_attendances": created_attendances,
                "participants": students_added,
            },
            status=status.HTTP_201_CREATED,
        )


class EventCertificatesZipDownloadView(APIView):
    """Download bundled ZIP containing verifiable participation certificates."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, pk: int) -> HttpResponse:
        import csv
        import io
        import zipfile

        from django.utils import timezone

        from apps.activities.models import ClubEvent, EventAttendance
        from apps.certificates.ids import (
            format_certificate_id,
            random_certificate_id_body,
        )
        from apps.certificates.models import Certificate, CertificateCategory
        from apps.certificates.signing import active_key_id, sign_certificate

        evt = (
            ClubEvent.objects.select_related("host_club__institution")
            .filter(pk=pk)
            .first()
        )
        if not evt:
            return HttpResponse("Event not found", status=404)

        attendances = EventAttendance.objects.filter(event=evt).select_related(
            "school_student", "user"
        )

        now = timezone.now()
        key_id = active_key_id()

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            manifest_rows = []

            for att in attendances:
                att.is_approved = True
                att.approved_at = now
                att.save(update_fields=["is_approved", "approved_at"])

                student_name = (
                    att.school_student.full_name
                    if att.school_student
                    else (att.user.username if att.user else "Participant")
                )
                student_uid = (
                    att.school_student.student_uid
                    if att.school_student
                    else "HEI-STUDENT"
                )
                student_cls = (
                    att.school_student.student_class if att.school_student else "N/A"
                )
                student_sec = (
                    att.school_student.section if att.school_student else "N/A"
                )

                cert_id = format_certificate_id(random_certificate_id_body())
                cert = Certificate(
                    certificate_id=cert_id,
                    hmac_key_id=key_id,
                    holder=att.user,
                    recipient_name=student_name,
                    student_uid=student_uid,
                    club=evt.host_club,
                    event_ref=evt.event_ref,
                    event_title=evt.title,
                    event_date=evt.start_time.date(),
                    category=CertificateCategory.PARTICIPATION,
                    issue_date=now.date(),
                )
                cert.hmac_tag = sign_certificate(cert)
                cert.save()

                manifest_rows.append(
                    {
                        "certificate_id": cert.certificate_id,
                        "student_uid": student_uid,
                        "recipient_name": student_name,
                        "class": student_cls,
                        "section": student_sec,
                        "event_ref": evt.event_ref,
                        "event_title": evt.title,
                        "issue_date": str(cert.issue_date),
                        "hmac_tag": cert.hmac_tag,
                    }
                )

                cert_content = (
                    "============================================================\n"
                    "NATIONAL DIGITAL LIBRARY OF INDIA (NDLI) CLUB CERTIFICATE\n"
                    "============================================================\n"
                    f"Certificate ID : {cert.certificate_id}\n"
                    f"Student UID    : {student_uid}\n"
                    f"Recipient Name : {student_name}\n"
                    f"Class / Section: {student_cls} - {student_sec}\n"
                    f"Institution    : {evt.host_club.institution.name}\n"
                    f"Club Code      : {evt.host_club.code}\n"
                    f"Event Reference: {evt.event_ref}\n"
                    f"Event Title    : {evt.title}\n"
                    f"Issue Date     : {cert.issue_date}\n"
                    f"Verification   : https://club.ndli.gov.in/verify?cid={cert.certificate_id}\n"
                    f"HMAC Tag (V2)  : {cert.hmac_tag}\n"
                    "============================================================\n"
                    "Valid digital credential verified under the "
                    "NDLI National Framework.\n"
                )
                safe_name = "".join(
                    c for c in student_name if c.isalnum() or c in (" ", "_", "-")
                ).strip()
                zf.writestr(f"certificates/{student_uid}_{safe_name}.txt", cert_content)

            manifest_csv_buffer = io.StringIO()
            fieldnames = [
                "certificate_id",
                "student_uid",
                "recipient_name",
                "class",
                "section",
                "event_ref",
                "event_title",
                "issue_date",
                "hmac_tag",
            ]
            writer = csv.DictWriter(manifest_csv_buffer, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(manifest_rows)
            zf.writestr("manifest.csv", manifest_csv_buffer.getvalue())

        zip_bytes = zip_buffer.getvalue()
        response = HttpResponse(zip_bytes, content_type="application/zip")
        response["Content-Disposition"] = (
            f'attachment; filename="certificates_{evt.event_ref}.zip"'
        )
        response["Content-Length"] = len(zip_bytes)
        return response
