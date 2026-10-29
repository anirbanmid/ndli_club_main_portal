"""M6 D5 renewal desk endpoints — the EMP zone desk + MCC attention queue.

Mounted at ``/admin/api/v1/governance/renewals/`` behind ``RENEWAL_GATE``
(admin module, decider sub-roles — the T3 admin door). Zone-bound officers
only ever see their own zone: scoping is queryset-level and out-of-zone rows
are indistinguishable from missing ones (404, never data, P0).

Both Q1 paths live here:
* ``POST issue/``        — Path B: issue directly from the attention queue.
* ``POST <pk>/issue/``   — Path A: issue from a club's open request.
The club-side submission door (Path A step 1) is ``/api/v1/clubs/renewal/
request/`` (club authorities only).
"""

from __future__ import annotations

from typing import Any

from django.http import Http404
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.policies import CategoryGate
from apps.domain.models import Club

from . import renewals
from .models import RenewalRecord
from .services import (
    DECIDER_SUB_ROLES,
    ZONE_BOUND_SUB_ROLES,
    GovernanceError,
    _sub_role,
    _zone_code,
)

RENEWAL_GATE = CategoryGate("admin", DECIDER_SUB_ROLES)
_PAGE_SIZE = 20


def _error(exc: GovernanceError) -> Response:
    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


def _note(body: dict[str, Any]) -> str:
    value = body.get("note", "")
    return str(value)[:500] if value else ""


def _scoped_records(user: Any) -> Any:
    qs = RenewalRecord.objects.select_related(
        "club", "club__institution__state", "certificate"
    )
    if _sub_role(user) in ZONE_BOUND_SUB_ROLES:
        qs = qs.filter(club__institution__state__zone__code=_zone_code(user))
    return qs


def _scoped_clubs(user: Any) -> Any:
    qs = Club.objects.select_related("institution__state")
    if _sub_role(user) in ZONE_BOUND_SUB_ROLES:
        qs = qs.filter(institution__state__zone__code=_zone_code(user))
    return qs


def _get_record_or_404(user: Any, pk: int) -> RenewalRecord:
    record = _scoped_records(user).filter(pk=pk).first()
    if record is None:
        raise Http404("not found")
    return record


def _get_club_or_404(user: Any, code: str) -> Club:
    club = _scoped_clubs(user).filter(code=code).first()
    if club is None:
        raise Http404("not found")
    return club


class RenewalAttentionView(APIView):
    """``GET .../renewals/attention/`` — attention queue (overdue OR ≤30d)."""

    permission_classes = [IsAuthenticated, RENEWAL_GATE]

    def get(self, request: Request) -> Response:
        try:
            rows = renewals.attention_for(request.user)
        except GovernanceError as exc:
            return _error(exc)

        f = request.query_params.get("filter", "ALL").strip()
        if f.lower() == "overdue":
            rows = [
                r
                for r in rows
                if r.get("attention") == "overdue"
                or r.get("attention_type") == "Overdue"
            ]
        elif f.lower() in ("expiring", "expiring soon") or "expir" in f.lower():
            rows = [
                r
                for r in rows
                if r.get("attention") == "expiring"
                or r.get("attention_type") == "Expiring Soon"
            ]

        q = request.query_params.get("q", "").strip().lower()
        if q:
            rows = [
                r
                for r in rows
                if q in r.get("club_code", "").lower()
                or q in r.get("club_name", "").lower()
                or q in r.get("institution_name", "").lower()
                or q in r.get("state", "").lower()
                or q in r.get("zone", "").lower()
            ]

        overdue_cnt = sum(1 for r in rows if r.get("days_left", 0) < 0)
        expiring_cnt = len(rows) - overdue_cnt

        paginator = PageNumberPagination()
        paginator.page_size = _PAGE_SIZE
        page = paginator.paginate_queryset(rows, request)
        resp = paginator.get_paginated_response(page or [])
        resp.data["total_attention_count"] = len(rows)
        resp.data["overdue_count"] = overdue_cnt
        resp.data["expiring_soon_count"] = expiring_cnt
        return resp


class RenewalListView(APIView):
    """``GET .../renewals/`` — renewal history, zone-scoped + paginated."""

    permission_classes = [IsAuthenticated, RENEWAL_GATE]

    def get(self, request: Request) -> Response:
        qs = _scoped_records(request.user).order_by("-created_at", "-id")
        paginator = PageNumberPagination()
        paginator.page_size = _PAGE_SIZE
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            [renewals.record_payload(r) for r in page or []]
        )


class RenewalIssueView(APIView):
    """``POST .../renewals/<pk>/issue/`` — Path A: issue an open request."""

    permission_classes = [IsAuthenticated, RENEWAL_GATE]

    def post(self, request: Request, pk: int) -> Response:
        record = _get_record_or_404(request.user, pk)
        try:
            record, cert = renewals.issue_renewal(
                request.user, record=record, request=request
            )
        except GovernanceError as exc:
            return _error(exc)
        return Response(
            {**renewals.record_payload(record), "certificate_id": cert.certificate_id},
            status=status.HTTP_201_CREATED,
        )


class RenewalDirectIssueView(APIView):
    """``POST .../renewals/issue/`` — Path B: issue straight from attention."""

    permission_classes = [IsAuthenticated, RENEWAL_GATE]

    def post(self, request: Request) -> Response:
        code = str(request.data.get("club_code", "")).strip()
        if not code:
            return _error(GovernanceError("club_code required"))
        club = _get_club_or_404(request.user, code)
        try:
            record, cert = renewals.issue_renewal(
                request.user, club=club, request=request
            )
        except GovernanceError as exc:
            return _error(exc)
        return Response(
            {**renewals.record_payload(record), "certificate_id": cert.certificate_id},
            status=status.HTTP_201_CREATED,
        )


class RenewalRejectView(APIView):
    """``POST .../renewals/<pk>/reject/`` — reject an open request."""

    permission_classes = [IsAuthenticated, RENEWAL_GATE]

    def post(self, request: Request, pk: int) -> Response:
        record = _get_record_or_404(request.user, pk)
        try:
            record = renewals.reject_renewal(
                request.user, record=record, note=_note(request.data), request=request
            )
        except GovernanceError as exc:
            return _error(exc)
        return Response(renewals.record_payload(record))
