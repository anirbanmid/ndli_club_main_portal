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

from datetime import date, timedelta
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record as audit_record
from apps.domain.models import OfficerAssignment, State

from .models import IIT_KGP_ADMIN_SUB_ROLES, Category, SubRole, User
from .policies import CategoryGate

#: Read door (owner decision 05:45): every IIT Kgp admin — including
#: regional officers — may SEE who handles which states (coordination).
READ_GATE = CategoryGate("admin", IIT_KGP_ADMIN_SUB_ROLES)

#: Write door: the master roles that define everyone else's duty.
#: Regional officers are deliberately absent.
DUTY_GATE = CategoryGate(
    "admin", {SubRole.CENTRAL_ADMIN, SubRole.SUPER_ADMIN_OPS}
)

#: The single audit action this module writes (P0: every change audited).
DUTY_ACTION = "employee.duty.replaced"


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
            results.append(
                {
                    "id": officer.pk,
                    "username": officer.username,
                    "name": officer.get_full_name() or officer.username,
                    "email": officer.email,
                    "state_codes": codes,
                    "states": [
                        _state_payload(states[code])
                        for code in codes
                        if code in states
                    ],
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
        added: list[str] = []
        removed: list[str] = []
        with transaction.atomic():
            active = list(
                OfficerAssignment.objects.select_for_update()
                .select_related("state")
                .filter(officer=officer)
                .filter(_active_filter())
            )
            active_codes = {row.state.code for row in active}
            for row in active:
                if row.state.code not in codes:
                    _deactivate(row, today)
                    removed.append(row.state.code)
            # Rows that never took effect must not take effect later.
            (
                OfficerAssignment.objects.filter(officer=officer)
                .filter(from_date__gt=today)
                .exclude(state__code__in=codes)
                .delete()
            )
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
