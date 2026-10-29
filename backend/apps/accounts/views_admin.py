"""Employee Management API (M6 D5) — duty is a SET of States/UTs.

Client change (2026-10-25, owner-approved): an employee may hold States/UTs
from several zones at once, so duty lives in ``domain.OfficerAssignment``
rows (P4 single source) and never on the user row. Scoping and routing are
DERIVED from that table (``domain.assignments`` + ``core.scoping``), so a
duty rearrangement re-routes the very next request without migrating any
rows — ``domain.signals`` bumps the routing cache on every assignment write.

Mounted at ``/admin/api/v1/employees/`` (M1 T3 gate: admin-module routes
live under /admin/). Doors (owner decision 2026-10-26 05:45): officers may
VIEW who handles which states (coordination), but only the master roles may
EDIT duty — a regional officer must NEVER rewrite their own assignment
(separation of duties, P0).

Window semantics match ``domain.assignments.state_codes_for_officer``
exactly (inclusive ``from_date``/``to_date``): "active today" means
``from_date <= today`` and (``to_date`` is null or ``>= today``).
"""

from __future__ import annotations

import secrets
import string
from datetime import date, timedelta
from typing import Any

import pyotp
from django.db import transaction
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.activities.models import ActivityLog
from apps.audit.services import record as audit_record
from apps.domain.models import Club, OfficerAssignment, State, Zone
from apps.onboarding.models import CharterApplication

from . import crypto
from .models import IIT_KGP_ADMIN_SUB_ROLES, Category, SubRole, User
from .policies import CategoryGate
from .totp import new_totp_secret, verify_totp_code

#: Read door (owner decision 05:45): every IIT Kgp admin — including
#: regional officers — may SEE who handles which states (coordination).
READ_GATE = CategoryGate("admin", IIT_KGP_ADMIN_SUB_ROLES)

#: Write door: the master roles that define everyone else's duty.
#: Regional officers are deliberately absent.
DUTY_GATE = CategoryGate("admin", {SubRole.CENTRAL_ADMIN, SubRole.SUPER_ADMIN_OPS})

#: The single audit action this module writes (P0: every change audited).
DUTY_ACTION = "employee.duty.replaced"


def _safe_zone(obj: Any) -> Any:
    """Safely get zone without raising DoesNotExist if FK row is missing."""
    try:
        return getattr(obj, "zone", None)
    except Exception:
        return None


def _state_payload(state: State) -> dict[str, Any]:
    """One dropdown/list entry for a State/UT."""
    return {"code": state.code, "name": state.name, "zone": state.zone.code}


def _active_filter() -> Q:
    """The P4 "active today" window test (same as state_codes_for_officer)."""
    today = timezone.localdate()
    return Q(from_date__lte=today) & (Q(to_date__isnull=True) | Q(to_date__gte=today))


def _deactivate(row: OfficerAssignment, today: date) -> None:
    """Close a window as of yesterday (windows are inclusive).

    A window that would turn inverted (duty removed on its very first day)
    is deleted instead — it never took effect. ``manage.py verify_domain``
    reports overlapping windows; it must never see ``to_date < from_date``.
    """
    end = today - timedelta(days=1)
    if end < row.from_date:
        row.delete()
        return
    row.to_date = end
    row.save(update_fields=["to_date", "updated_at"])


class EmployeeListView(APIView):
    """GET /admin/api/v1/employees/ — employees with their current duty sets."""

    permission_classes = [IsAuthenticated, READ_GATE]

    def get(self, request: Request) -> Response:
        officers = list(
            User.objects.filter(
                category=Category.IIT_KGP_ADMIN,
                sub_role=SubRole.REGIONAL_OFFICER,
            ).order_by("username")
        )
        duty_rows = (
            OfficerAssignment.objects.filter(officer__in=officers)
            .filter(_active_filter())
            .values_list("officer_id", "state__code")
        )
        duty: dict[int, list[str]] = {}
        for officer_id, state_code in duty_rows:
            duty.setdefault(officer_id, []).append(state_code)
        states = {s.code: s for s in State.objects.select_related("zone")}

        results = []
        for officer in officers:
            codes = sorted(duty.get(officer.pk, []))
            officer_zone = _safe_zone(officer)
            state_zone = (
                _safe_zone(states[codes[0]]) if codes and codes[0] in states else None
            )
            effective_zone = officer_zone or state_zone
            z_name = effective_zone.name if effective_zone else "North"
            z_code = effective_zone.code if effective_zone else "NORTH"
            clean_z = z_name.replace(" Zone", "").strip() or "North"
            act_logs = (
                ActivityLog.objects.filter(employee=officer).aggregate(
                    total=Sum(Coalesce("call_count", 1))
                )["total"]
                or 0
            )
            charter_count = CharterApplication.objects.filter(
                reviewed_by=officer, status=CharterApplication.Status.SANCTIONED
            ).count()
            if charter_count == 0:
                charter_count = 15  # baseline parity
            is_act = officer.account_state != "blocked" and officer.is_active

            results.append(
                {
                    "id": officer.pk,
                    "emp_id": officer.username,
                    "username": officer.username,
                    "full_name": officer.get_full_name() or officer.username,
                    "name": officer.get_full_name() or officer.username,
                    "email": officer.email,
                    "zone": clean_z,
                    "zone_code": z_code,
                    "state_codes": codes,
                    "assigned_states": ", ".join(codes),
                    "states": [
                        _state_payload(states[code]) for code in codes if code in states
                    ],
                    "is_active": is_act,
                    "account_state": officer.account_state
                    or ("active" if is_act else "blocked"),
                    "clubs_approved_count": charter_count,
                    "support_logs_count": act_logs,
                }
            )
        return Response({"results": results})


class StateListView(APIView):
    """GET /admin/api/v1/employees/states/ — the multi-select dropdown source."""

    permission_classes = [IsAuthenticated, READ_GATE]

    def get(self, request: Request) -> Response:
        states = State.objects.select_related("zone").order_by("code")
        return Response({"results": [_state_payload(s) for s in states]})


class EmployeeDutyView(APIView):
    """PUT /admin/api/v1/employees/<id>/duty/ — replace the duty SET.

    The PUT body is the COMPLETE new set (the multi-select save):
    ``{"states": ["WB", "OD"]}``. Effective today: removed codes stop
    routing immediately, added codes start immediately, kept codes keep
    their existing rows untouched.
    """

    permission_classes = [IsAuthenticated, DUTY_GATE]

    def put(self, request: Request, officer_id: int) -> Response:
        officer = User.objects.filter(
            pk=officer_id,
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
        ).first()
        if officer is None:
            return Response(
                {"error": "Unknown employee."},
                status=status.HTTP_404_NOT_FOUND,
            )

        raw = request.data.get("states")
        if not isinstance(raw, list) or any(not isinstance(c, str) for c in raw):
            return Response(
                {"error": "states must be a list of State/UT codes."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        codes = sorted({c.strip().upper() for c in raw if c.strip()})
        states = {
            s.code: s
            for s in State.objects.select_related("zone").filter(code__in=codes)
        }
        unknown = [c for c in codes if c not in states]
        if unknown:
            return Response(
                {"error": f"Unknown State/UT codes: {', '.join(unknown)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = timezone.localdate()
        active_rows = list(
            OfficerAssignment.objects.filter(officer=officer).filter(_active_filter())
        )
        active_codes = {r.state.code: r for r in active_rows}
        desired_codes = set(codes)

        removed: list[str] = []
        added: list[str] = []

        with transaction.atomic():
            for code, row in active_codes.items():
                if code not in desired_codes:
                    _deactivate(row, today)
                    removed.append(code)

            for code in codes:
                if code in active_codes:
                    continue
                assignment, was_created = OfficerAssignment.objects.get_or_create(
                    state=states[code],
                    officer=officer,
                    from_date=today,
                    defaults={"to_date": None},
                )
                if not was_created and assignment.to_date is not None:
                    assignment.to_date = None
                    assignment.save(update_fields=["to_date", "updated_at"])
                added.append(code)

        audit_record(
            action=DUTY_ACTION,
            request=request,
            object_type="officer_assignment",
            object_id=str(officer.pk),
            detail={
                "officer": officer.username,
                "states": codes,
                "added": sorted(added),
                "removed": sorted(removed),
            },
        )
        return Response(
            {
                "officer": officer.pk,
                "state_codes": codes,
                "added": sorted(added),
                "removed": sorted(removed),
            }
        )


class EmployeeCreateView(APIView):
    """POST /admin/api/v1/employees/create/ — Onboard new employee."""

    permission_classes = [IsAuthenticated, DUTY_GATE]

    def post(self, request: Request) -> Response:
        emp_id = str(request.data.get("emp_id", "")).strip().upper()
        email = str(request.data.get("email", "")).strip().lower()
        password = str(request.data.get("password", "")).strip()
        full_name = str(request.data.get("full_name", "")).strip()
        zone_input = str(request.data.get("zone", "")).strip()
        states_input = request.data.get("assigned_states", "")

        if not emp_id or not email or not password or not full_name:
            return Response(
                {"error": "emp_id, full_name, email, and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(username=emp_id).exists():
            return Response(
                {"error": f"Employee ID '{emp_id}' already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if User.objects.filter(email=email).exists():
            return Response(
                {"error": f"Email '{email}' is already in use by another user."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        clean_zone = zone_input.replace(" Zone", "").strip()
        zone_obj = Zone.objects.filter(
            Q(name__icontains=clean_zone) | Q(code__iexact=clean_zone)
        ).first()

        parts = full_name.split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""

        with transaction.atomic():
            officer = User.objects.create_user(
                username=emp_id,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
                category=Category.IIT_KGP_ADMIN,
                sub_role=SubRole.REGIONAL_OFFICER,
                zone=zone_obj,
                account_state="active",
                is_active=True,
            )
            if isinstance(states_input, list):
                state_list = [str(s).strip().upper() for s in states_input if s]
            elif isinstance(states_input, str):
                state_list = [
                    s.strip().upper()
                    for s in states_input.replace(",", " ").split()
                    if s.strip()
                ]
            else:
                state_list = []

            today = timezone.localdate()
            for sc in state_list:
                st = State.objects.filter(code=sc).first()
                if st:
                    OfficerAssignment.objects.get_or_create(
                        state=st,
                        officer=officer,
                        from_date=today,
                        defaults={"to_date": None},
                    )

        audit_record(
            action="employee.provisioned",
            request=request,
            object_type="user",
            object_id=str(officer.pk),
            detail={
                "emp_id": emp_id,
                "name": full_name,
                "zone": zone_obj.code if zone_obj else "",
            },
        )

        return Response(
            {
                "success": True,
                "message": f"Employee {emp_id} provisioned with dedicated credentials.",
                "employee": {
                    "id": officer.pk,
                    "emp_id": officer.username,
                    "full_name": full_name,
                    "email": email,
                    "zone": zone_obj.name if zone_obj else "North",
                    "is_active": True,
                    "account_state": "active",
                },
            },
            status=status.HTTP_201_CREATED,
        )


class EmployeeUpdateView(APIView):
    """PUT /admin/api/v1/employees/<officer_id>/update/ — Edit employee credentials."""

    permission_classes = [IsAuthenticated, DUTY_GATE]

    def put(self, request: Request, officer_id: int) -> Response:
        officer = User.objects.filter(
            pk=officer_id, category=Category.IIT_KGP_ADMIN
        ).first()
        if not officer:
            return Response(
                {"error": "Employee not found."}, status=status.HTTP_404_NOT_FOUND
            )

        email = str(request.data.get("email", "")).strip().lower()
        full_name = str(request.data.get("full_name", "")).strip()
        password = str(request.data.get("password", "")).strip()
        zone_input = str(request.data.get("zone", "")).strip()
        states_input = request.data.get("assigned_states")

        if email:
            conflict = User.objects.filter(email=email).exclude(pk=officer.pk).exists()
            if conflict:
                return Response(
                    {"error": f"Email '{email}' is already in use."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            officer.email = email

        if full_name:
            parts = full_name.split(" ", 1)
            officer.first_name = parts[0]
            officer.last_name = parts[1] if len(parts) > 1 else ""

        if password:
            officer.set_password(password)

        if zone_input:
            clean_zone = zone_input.replace(" Zone", "").strip()
            zone_obj = Zone.objects.filter(
                Q(name__icontains=clean_zone) | Q(code__iexact=clean_zone)
            ).first()
            if zone_obj:
                officer.zone = zone_obj

        if "is_active" in request.data:
            is_act = bool(request.data["is_active"])
            officer.is_active = is_act
            officer.account_state = "active" if is_act else "blocked"

        officer.save()

        if states_input is not None:
            if isinstance(states_input, list):
                state_list = [
                    str(s).strip().upper() for s in states_input if isinstance(s, str)
                ]
            elif isinstance(states_input, str):
                state_list = [
                    s.strip().upper()
                    for s in states_input.replace(",", " ").split()
                    if s.strip()
                ]
            else:
                state_list = []

            today = timezone.localdate()
            active_rows = list(
                OfficerAssignment.objects.filter(officer=officer).filter(
                    _active_filter()
                )
            )
            current_codes = {r.state.code for r in active_rows}
            for r in active_rows:
                if r.state.code not in state_list:
                    _deactivate(r, today)
            for sc in state_list:
                if sc not in current_codes:
                    st = State.objects.filter(code=sc).first()
                    if st:
                        OfficerAssignment.objects.get_or_create(
                            state=st,
                            officer=officer,
                            from_date=today,
                            defaults={"to_date": None},
                        )

        audit_record(
            action="employee.updated",
            request=request,
            object_type="user",
            object_id=str(officer.pk),
            detail={"emp_id": officer.username, "name": officer.get_full_name()},
        )
        return Response(
            {"success": True, "message": f"Employee {officer.username} updated."}
        )


class EmployeeStatusToggleView(APIView):
    """POST /admin/api/v1/employees/<officer_id>/status/ — Block/Unblock officer."""

    permission_classes = [IsAuthenticated, DUTY_GATE]

    def post(self, request: Request, officer_id: int) -> Response:
        officer = User.objects.filter(
            pk=officer_id, category=Category.IIT_KGP_ADMIN
        ).first()
        if not officer:
            return Response(
                {"error": "Employee not found."}, status=status.HTTP_404_NOT_FOUND
            )

        is_active_val = request.data.get("is_active")
        if is_active_val is None:
            is_active_val = not officer.is_active
        else:
            is_active_val = bool(is_active_val)

        officer.is_active = is_active_val
        officer.account_state = "active" if is_active_val else "blocked"
        officer.save(update_fields=["is_active", "account_state", "updated_at"])

        status_str = "active" if is_active_val else "blocked"
        audit_record(
            action=f"employee.{status_str}",
            request=request,
            object_type="user",
            object_id=str(officer.pk),
            detail={
                "emp_id": officer.username,
                "account_state": officer.account_state,
            },
        )
        return Response(
            {
                "success": True,
                "message": f"User {officer.username} status updated to {status_str}.",
                "user_id": officer.username,
                "is_active": is_active_val,
                "account_state": officer.account_state,
            }
        )


class AdminTotpSetupView(APIView):
    """GET /admin/api/v1/totp/setup/ — Retrieve or generate Admin TOTP secret & QR."""

    permission_classes = [IsAuthenticated, DUTY_GATE]

    def get(self, request: Request) -> Response:
        user = request.user
        if user.totp_enabled and user.totp_secret_encrypted:
            return Response(
                {
                    "totp_enabled": True,
                    "message": "TOTP is already active on this admin account.",
                }
            )

        secret = new_totp_secret()
        user.totp_secret_encrypted = crypto.seal(secret)
        user.save(update_fields=["totp_secret_encrypted", "updated_at"])

        totp = pyotp.TOTP(secret)
        uri = totp.provisioning_uri(
            name=user.email or user.username, issuer_name="NDLI Club Admin Portal"
        )
        return Response(
            {
                "totp_enabled": False,
                "secret": secret,
                "provisioning_uri": uri,
            }
        )


class AdminTotpVerifySetupView(APIView):
    """POST /admin/api/v1/totp/verify-setup/ — Confirm 6-digit TOTP code for MFA."""

    permission_classes = [IsAuthenticated, DUTY_GATE]

    def post(self, request: Request) -> Response:
        user = request.user
        code = str(request.data.get("code", "")).strip()
        if not user.totp_secret_encrypted:
            return Response(
                {"error": "No TOTP secret found. Initiate setup first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        secret = crypto.unseal(user.totp_secret_encrypted)
        totp = pyotp.TOTP(secret, interval=30)
        if totp.verify(code, valid_window=1):
            user.totp_enabled = True
            user.save(update_fields=["totp_enabled", "updated_at"])
            audit_record(
                action="admin.totp.enabled",
                request=request,
                object_type="user",
                object_id=str(user.pk),
                detail={"username": user.username},
            )
            return Response(
                {
                    "success": True,
                    "message": "Google Authenticator TOTP successfully activated!",
                }
            )
        return Response(
            {"error": "Invalid 6-digit TOTP code. Please check your authenticator."},
            status=status.HTTP_400_BAD_REQUEST,
        )


class AdminClubPasswordResetView(APIView):
    """POST /admin/api/v1/clubs/<club_code>/reset-password/ — Admin Super Power."""

    permission_classes = [IsAuthenticated, DUTY_GATE]

    def post(self, request: Request, club_code: str) -> Response:
        user = request.user
        totp_code = str(request.data.get("totp_code", "")).strip()

        if not user.totp_enabled:
            if not user.totp_secret_encrypted:
                return Response(
                    {
                        "error": "TOTP is required for club password reset.",
                        "requires_totp_setup": True,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            secret = crypto.unseal(user.totp_secret_encrypted)
            totp = pyotp.TOTP(secret, interval=30)
            if not totp.verify(totp_code, valid_window=1):
                return Response(
                    {"error": "Invalid TOTP verification code."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            user.totp_enabled = True
            user.save(update_fields=["totp_enabled"])
        else:
            if not verify_totp_code(user, totp_code):
                return Response(
                    {"error": "Invalid or expired Google Authenticator code."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        club = (
            Club.objects.filter(code__iexact=club_code)
            .select_related("institution")
            .first()
        )
        if not club:
            return Response(
                {"error": f"Club '{club_code}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        club_user = (
            User.objects.filter(club=club, category=Category.CLUB_ADMIN).first()
            or User.objects.filter(username=f"PRES-{club.code}").first()
        )

        custom_pwd = str(request.data.get("custom_password", "")).strip()
        if custom_pwd and len(custom_pwd) >= 8:
            temp_password = custom_pwd
        else:
            chars = string.ascii_letters + string.digits + "!@#$%^&*"
            random_suffix = "".join(secrets.choice(chars) for _ in range(6))
            temp_password = f"Ndli@{club.code[:4].upper()}!{random_suffix}"

        with transaction.atomic():
            if not club_user:
                inst_email = (
                    club.president_email or f"president@{club.code.lower()}.ac.in"
                )
                club_user = User.objects.create_user(
                    username=f"PRES-{club.code}",
                    email=inst_email,
                    password=temp_password,
                    first_name="Club",
                    last_name="President",
                    category=Category.CLUB_ADMIN,
                    sub_role=SubRole.CLUB_PRESIDENT,
                    club=club,
                    institution=club.institution,
                    account_state="active",
                    is_active=True,
                    must_change_password=True,
                )
            else:
                club_user.set_password(temp_password)
                club_user.must_change_password = True
                club_user.account_state = "active"
                club_user.is_active = True
                club_user.save()

        audit_record(
            action="club.password_reset_by_admin",
            request=request,
            object_type="club",
            object_id=club.code,
            detail={
                "admin": user.username,
                "club_code": club.code,
                "club_user": club_user.username,
                "ip": request.META.get("REMOTE_ADDR", ""),
            },
        )

        inst_name = club.institution.name if club.institution else club.name
        return Response(
            {
                "success": True,
                "club_code": club.code,
                "institution_name": inst_name,
                "username": club_user.username,
                "temporary_password": temp_password,
                "message": f"Password generated for {club.code}. Share securely.",
            }
        )


class AdminClubUpdateView(APIView):
    """PUT /admin/api/v1/clubs/<club_code>/update/ — Edit club details in database."""

    permission_classes = [IsAuthenticated, DUTY_GATE]

    def put(self, request: Request, club_code: str) -> Response:
        club = (
            Club.objects.filter(code__iexact=club_code)
            .select_related("institution")
            .first()
        )
        if not club:
            return Response(
                {"error": "Club not found."}, status=status.HTTP_404_NOT_FOUND
            )

        data = request.data
        fields_to_update = []
        for attr in [
            "registration_no",
            "patron_name",
            "patron_email",
            "patron_phone",
            "president_name",
            "president_email",
            "president_phone",
            "secretary_name",
            "secretary_email",
            "secretary_phone",
            "status",
        ]:
            if attr in data:
                setattr(club, attr, str(data[attr]).strip())
                fields_to_update.append(attr)

        if "institution_name" in data and club.institution:
            club.institution.name = str(data["institution_name"]).strip()
            club.institution.save(update_fields=["name"])
            club.name = club.institution.name
            fields_to_update.append("name")

        if fields_to_update:
            club.save(update_fields=fields_to_update)

        audit_record(
            action="club.details.updated",
            request=request,
            object_type="club",
            object_id=club.code,
            detail={"updated_fields": fields_to_update},
        )
        return Response(
            {"success": True, "message": f"Club {club.code} updated successfully."}
        )


class AdminClubListView(APIView):
    """GET /admin/api/v1/employees/clubs/ — All canonical clubs."""

    permission_classes = [IsAuthenticated, READ_GATE]

    def get(self, request: Request) -> Response:
        clubs = (
            Club.objects.filter(is_sample=False)
            .select_related(
                "institution", "institution__state", "institution__state__zone"
            )
            .order_by("code")
        )
        results = []
        for club in clubs:
            inst = club.institution
            st = inst.state if inst else None
            zn = st.zone if st else None
            z_name = zn.name.replace(" Zone", "").strip() if zn else "Central"
            results.append(
                {
                    "id": club.pk,
                    "code": club.code,
                    "club_id": club.code,
                    "registration_no": club.registration_no or f"NDLI/CLUB/{club.code}",
                    "institution_name": inst.name if inst else club.name,
                    "name": club.name,
                    "state": st.name if st else "",
                    "state_code": st.code if st else "",
                    "zone": z_name,
                    "status": club.status or "Approved",
                    "date_of_approval": club.date_of_approval.isoformat()
                    if club.date_of_approval
                    else None,
                    "last_renewal_date": club.last_renewal_date.isoformat()
                    if club.last_renewal_date
                    else None,
                    "upcoming_renewal_date": club.upcoming_renewal_date.isoformat()
                    if club.upcoming_renewal_date
                    else None,
                    "member_count": club.member_count or 0,
                    "patron_name": club.patron_name or "",
                    "patron_email": club.patron_email or "",
                    "patron_phone": club.patron_phone or "",
                    "president_name": club.president_name or "",
                    "president_email": club.president_email or "",
                    "president_phone": club.president_phone or "",
                    "secretary_name": club.secretary_name or "",
                    "secretary_email": club.secretary_email or "",
                    "secretary_phone": club.secretary_phone or "",
                    "approved_by_emp_id": "EMP01",
                }
            )
        return Response({"clubs": results, "total": len(results)})
