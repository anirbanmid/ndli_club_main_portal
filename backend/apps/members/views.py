"""HTTP views for the Members app — M4 D3 roster-side join decisions.

The roster VIEW of pending campus self-joins: list, confirm, reject. All
three are club-activity-controlling (W9) — reachable ONLY by authenticated
club authorities with fresh password state, and every queryset/object is
scoped by the M2 scope keys (``ObjectScope("clubs")`` turns cross-club IDs
into 404, never data). Confirming is the ONLY path from a campus self-join
to a ``domain.Membership`` row (D3).
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.policies import CLUB_AUTHORITY_GATE, ObjectScope
from apps.core import scoping

from . import services
from .models import JoinRequest
from .services import MemberError

#: Status filter allowlist for the roster view (no free-text lookups).
STATUS_FILTERS = {choice.value for choice in JoinRequest.Status}


def _error(exc: MemberError) -> Response:
    return Response(
        {"detail": exc.message, "code": exc.code}, status=exc.http_status
    )


def _join_request_or_404(request: Request, pk: int) -> JoinRequest:
    """Load one join request (object scoping 404s cross-club, never data)."""
    join_request = (
        JoinRequest.objects.select_related(
            "user",
            "club",
            "club__institution",
            "club__institution__state",
            "club__institution__state__zone",
        )
        .filter(pk=pk)
        .first()
    )
    if join_request is None:
        raise NotFound("Not found.")
    return join_request


class JoinRequestListView(APIView):
    """``GET /api/v1/members/joins/`` — the club's join requests (roster view)."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def get(self, request: Request) -> Response:
        queryset = scoping.scope_clubs(JoinRequest.objects.all(), request.user)
        requested_status = str(request.query_params.get("status", "")).strip()
        if requested_status:
            if requested_status not in STATUS_FILTERS:
                return Response(
                    {"detail": "Unknown status filter."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = queryset.filter(status=requested_status)
        rows = queryset.select_related("user", "club").order_by("-created_at", "id")
        return Response(
            {"results": [services.join_request_payload(row) for row in rows]}
        )


class JoinRequestConfirmView(APIView):
    """``POST /api/v1/members/joins/<pk>/confirm/`` — pending -> membership."""

    permission_classes = [
        IsAuthenticated,
        CLUB_AUTHORITY_GATE,
        ObjectScope("clubs"),
    ]

    def post(self, request: Request, pk: int) -> Response:
        join_request = _join_request_or_404(request, pk)
        self.check_object_permissions(request, join_request)
        try:
            membership = services.confirm_join(
                join_request=join_request,
                decided_by=request.user,
                request=request,
            )
        except MemberError as exc:
            return _error(exc)
        return Response(
            {
                "id": join_request.pk,
                "status": join_request.status,
                "membership": {
                    "id": membership.pk,
                    "role": membership.role,
                    "status": membership.status,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class JoinRequestRejectView(APIView):
    """``POST /api/v1/members/joins/<pk>/reject/`` — pending -> rejected."""

    permission_classes = [
        IsAuthenticated,
        CLUB_AUTHORITY_GATE,
        ObjectScope("clubs"),
    ]

    def post(self, request: Request, pk: int) -> Response:
        join_request = _join_request_or_404(request, pk)
        self.check_object_permissions(request, join_request)
        try:
            services.reject_join(
                join_request=join_request,
                decided_by=request.user,
                request=request,
            )
        except MemberError as exc:
            return _error(exc)
        return Response(
            {"id": join_request.pk, "status": join_request.status}
        )
