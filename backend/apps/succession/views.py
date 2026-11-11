"""HTTP views for the Succession app — dual-control succession desk.

Thin adapters over ``succession.services`` (the rules live there). Discipline:

* Authorization decisions live ONLY in ``accounts.policies`` (the gates below)
  plus the service-level scoping (``services.club_requests_for`` /
  ``services.desk_for``) and ``services.authorize_decision`` — out-of-scope
  IDs are indistinguishable from missing ones: 404, never data.
* Views never branch on who the caller is (T3 greps for that).
* The intake endpoint reads EXACTLY SIX body fields (``tier``, ``name``,
  ``email``, ``phone``, ``reason``, ``confirm_conflict``); the decide
  endpoint reads EXACTLY TWO (``decision``, ``note``). The club ALWAYS comes
  from the caller's own record — no mass assignment of club/status/decision
  fields is possible, ever.

Doors: the club namespace (read for all four authority tiers — the Executive
Council stays view-only; write for Main Admins) and ``/admin/api/v1/
succession/`` (the IIT Kgp employee desk, MFA demanded by the gate).
"""

from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.policies import (
    ADMIN_STAFF_GATE,
    CLUB_AUTHORITY_GATE,
    MAIN_CLUB_ADMIN_GATE,
)

from .models import SuccessionRequest
from .services import (
    SuccessionError,
    club_requests_for,
    decide_at_desk,
    decide_in_club,
    desk_for,
    submit_request,
)

_PAGE_SIZE = 20


def _error(exc: SuccessionError) -> Response:
    return Response(
        {"detail": exc.message, "code": exc.code, **exc.extra},
        status=exc.http_status,
    )


def _as_bool(value: Any) -> bool:
    """Booleans from JSON or form bodies ('false' is False, always)."""
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y"}
    return bool(value)


def _payload(req: SuccessionRequest, *, detail: bool = False) -> dict[str, Any]:
    """One request row for the API (``conflicts`` = the approver's recheck)."""
    club = req.club
    state = getattr(getattr(club, "institution", None), "state", None)
    payload: dict[str, Any] = {
        "id": str(req.pk),
        "club_code": club.code,
        "club_name": club.name,
        "state_code": str(getattr(state, "code", "") or ""),
        "tier": req.tier,
        "status": req.status,
        "proposed_name": req.proposed_name,
        "proposed_email": req.proposed_email,
        "proposed_phone": req.proposed_phone,
        "reason": req.reason,
        "conflicts": req.conflict_snapshot or [],
        "conflicts_confirmed": req.conflicts_confirmed,
        "submitted_by": getattr(req.submitted_by, "username", None),
        "created_at": req.created_at,
    }
    if detail:
        payload["decided_by"] = getattr(req.decided_by, "username", None)
        payload["decided_at"] = req.decided_at
        payload["decision_note"] = req.decision_note
    return payload


def _page(qs: Any, request: Request) -> Response:
    paginator = PageNumberPagination()
    paginator.page_size = _PAGE_SIZE
    page = paginator.paginate_queryset(qs, request)
    return paginator.get_paginated_response([_payload(r) for r in page or []])


def _not_found() -> Response:
    return _error(
        SuccessionError("Not found.", code="not_found", http_status=404)
    )


# ---------------------------------------------------------------------------
# Club side — own-club requests (module namespace "club")
# ---------------------------------------------------------------------------


class ClubSuccessionListCreateView(APIView):
    """``GET/POST /api/v1/succession/`` — own-club list + intake.

    GET is view access for every authority tier (the Executive Council stays
    view-only); POST is Main Admin territory — ``services.submit_request``
    enforces that (service-level, exactly like ``ensure_club_authority``).
    Intake reads exactly six body fields; every other key (status, club_id,
    submitted_by, ...) is deliberately ignored.
    """

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def get(self, request: Request) -> Response:
        return _page(club_requests_for(request.user), request)

    def post(self, request: Request) -> Response:
        try:
            req = submit_request(
                user=request.user,
                tier=request.data.get("tier", ""),
                name=request.data.get("name", ""),
                email=request.data.get("email", ""),
                phone=request.data.get("phone", ""),
                reason=request.data.get("reason", ""),
                confirmed=_as_bool(request.data.get("confirm_conflict", False)),
                request=request,
            )
        except SuccessionError as exc:
            return _error(exc)
        return Response(_payload(req, detail=True), status=status.HTTP_201_CREATED)


class ClubSuccessionDetailView(APIView):
    """``GET /api/v1/succession/<pk>/`` — own-club request incl. conflicts.

    Another club's request is indistinguishable from a missing one (404).
    """

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def get(self, request: Request, pk: Any) -> Response:
        req = club_requests_for(request.user).filter(pk=pk).first()
        if req is None:
            return _not_found()
        return Response(_payload(req, detail=True))


class ClubSuccessionDecideView(APIView):
    """``POST /api/v1/succession/<pk>/decide/`` — approve/reject (Main Admins).

    Body: exactly ``decision`` + ``note``. Only executive-tier requests can
    be decided here (in-club, by ANOTHER Main Admin); patron/president/
    secretary posts belong to the officer on duty at
    ``/admin/api/v1/succession/``.
    """

    permission_classes = [IsAuthenticated, MAIN_CLUB_ADMIN_GATE]

    def post(self, request: Request, pk: Any) -> Response:
        try:
            req, result = decide_in_club(
                pk=pk,
                user=request.user,
                decision=str(request.data.get("decision", "")),
                note=str(request.data.get("note", "")),
                request=request,
            )
        except SuccessionError as exc:
            return _error(exc)
        payload = _payload(req, detail=True)
        payload.update(result)  # temporary_password / account_created
        return Response(payload)


# ---------------------------------------------------------------------------
# Admin side — the IIT Kgp employee desk (mounted under /admin/)
# ---------------------------------------------------------------------------


class SuccessionDeskView(APIView):
    """``GET /admin/api/v1/succession/desk/`` — the employee decision desk."""

    permission_classes = [IsAuthenticated, ADMIN_STAFF_GATE]

    def get(self, request: Request) -> Response:
        return _page(desk_for(request.user), request)


class SuccessionDeskDetailView(APIView):
    """``GET /admin/api/v1/succession/<pk>/`` — request + conflict snapshot.

    Duty-scoped via ``services.desk_for``: cross-duty IDs are 404, never
    data (P0). The ``conflicts`` list is what the employee re-verifies
    against before deciding.
    """

    permission_classes = [IsAuthenticated, ADMIN_STAFF_GATE]

    def get(self, request: Request, pk: Any) -> Response:
        req = desk_for(request.user).filter(pk=pk).first()
        if req is None:
            return _not_found()
        return Response(_payload(req, detail=True))


class SuccessionDeskDecideView(APIView):
    """``POST .../<pk>/decide/`` — the officer's approve/reject (2 fields).

    The same service as the club door; ``authorize_decision`` decides who
    (duty-derived for officers, oversight-refused for Central Admin).
    """

    permission_classes = [IsAuthenticated, ADMIN_STAFF_GATE]

    def post(self, request: Request, pk: Any) -> Response:
        try:
            req, result = decide_at_desk(
                pk=pk,
                user=request.user,
                decision=str(request.data.get("decision", "")),
                note=str(request.data.get("note", "")),
                request=request,
            )
        except SuccessionError as exc:
            return _error(exc)
        payload = _payload(req, detail=True)
        payload.update(result)  # temporary_password / account_created
        return Response(payload)
