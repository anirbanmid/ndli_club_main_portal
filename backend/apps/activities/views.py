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

import uuid
from typing import Any

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import AccountState
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
        created = [
            ActivityLog.objects.create(
                employee=target,
                support_type=support_type,
                notes=notes,
                club_code=club_code,
                bulk_group=bulk_group,
            )
            for _ in range(count)
        ]
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
                "activity": _serialize(created[0]),
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
