"""HTTP views for the Clubs app — M4 D3 showcase + campus self-join.

Discipline (P0/P4/I5):

* **Public surface** (showcase index/detail, join OTP door) is anonymous and
  read-only-or-join: it publishes PUBLIC-SAFE AGGREGATES ONLY (M4-A2) and is
  rate-limited per IP.
* **Dashboard surface** (dashboard, showcase edit, passkey
  issue/regenerate/revoke, join URL + QR) is reachable ONLY by authenticated
  club authorities — ``CategoryGate("club", CLUB_AUTHORITY_SUB_ROLES)`` with
  fresh-password state required (W9: the server refuses, client hiding is
  irrelevant). The club acted on is ALWAYS the caller's scope-key club;
  there is no cross-club address to swap.
* Authorization decisions live ONLY in ``accounts.policies``; views never
  branch on who the caller is (T3 greps for that).
* Services own the rules and the audit rows; views adapt HTTP.
"""

from __future__ import annotations

from typing import Any

from django.http import HttpResponse
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.policies import CLUB_AUTHORITY_GATE
from apps.accounts.throttles import client_ip, sliding_window_allow
from apps.governance.renewals import record_payload, request_renewal
from apps.governance.services import GovernanceError

from . import services
from .models import ClubShowcase
from .services import ClubError

#: Public-read and join-door ceilings per client IP per window (P0).
SHOWCASE_READ_LIMIT = 120
JOIN_ATTEMPT_LIMIT = services.JOIN_ATTEMPT_LIMIT
JOIN_WINDOW_SECONDS = services.JOIN_ATTEMPT_WINDOW_SECONDS

#: Bounded cache for the public showcase pages (P1: cacheable aggregates).
PUBLIC_CACHE_SECONDS = 60

#: Fixed answer for the join OTP door (same bytes always — no enumeration).
JOIN_OTP_ACCEPTED = {
    "detail": "If that address is reachable, a join code is on its way."
}


def _throttled(scope: str, limit: int, request: Request) -> Response | None:
    """429 when the per-IP sliding window is full (P0)."""
    key = f"clubs:{scope}:{client_ip(request)}"
    if not sliding_window_allow(key, limit, JOIN_WINDOW_SECONDS):
        return Response(
            {"detail": "Too many attempts. Try again later."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    return None


def _error(exc: ClubError) -> Response:
    return Response({"detail": exc.message, "code": exc.code}, status=exc.http_status)


def _public_response(payload: Any) -> Response:
    response = Response(payload)
    response["Cache-Control"] = f"public, max-age={PUBLIC_CACHE_SECONDS}"
    return response


# --- Public surface --------------------------------------------------------


class ShowcaseIndexView(APIView):
    """``GET /api/v1/clubs/showcase/`` — the public clubs directory (OPTION B)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request: Request) -> Response:
        blocked = _throttled("showcase_read", SHOWCASE_READ_LIMIT, request)
        if blocked is not None:
            return blocked
        queryset = ClubShowcase.objects.select_related(
            "club",
            "club__institution",
            "club__institution__state",
        ).order_by("slug")
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(queryset, request)
        cards = [
            {
                "slug": showcase.slug,
                "tagline": showcase.tagline,
                "club": {"code": showcase.club.code, "name": showcase.club.name},
                "institution": {
                    "code": showcase.club.institution.code,
                    "name": showcase.club.institution.name,
                },
                "state": {
                    "code": showcase.club.institution.state.code,
                    "name": showcase.club.institution.state.name,
                },
            }
            for showcase in page or []
        ]
        response = paginator.get_paginated_response(cards)
        response["Cache-Control"] = f"public, max-age={PUBLIC_CACHE_SECONDS}"
        return response


class ShowcaseDetailView(APIView):
    """``GET /api/v1/clubs/showcase/<slug>/`` — one public showcase page."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request: Request, slug: str) -> Response:
        blocked = _throttled("showcase_read", SHOWCASE_READ_LIMIT, request)
        if blocked is not None:
            return blocked
        showcase = (
            ClubShowcase.objects.select_related(
                "club",
                "club__institution",
                "club__institution__district",
                "club__institution__state",
                "club__institution__state__zone",
            )
            .prefetch_related("sections")
            .filter(slug=slug)
            .first()
        )
        if showcase is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return _public_response(services.showcase_payload(showcase))


class JoinOtpRequestView(APIView):
    """``POST /api/v1/clubs/join/otp/request/`` — passkey/QR + email -> OTP."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request: Request) -> Response:
        blocked = _throttled("join", JOIN_ATTEMPT_LIMIT, request)
        if blocked is not None:
            return blocked
        try:
            services.request_join_otp(
                passkey=str(request.data.get("passkey", "")).strip(),
                token=str(request.data.get("token", "")).strip(),
                email=str(request.data.get("email", "")).strip(),
                request=request,
            )
        except ClubError as exc:
            return _error(exc)
        return Response(JOIN_OTP_ACCEPTED, status=status.HTTP_202_ACCEPTED)


class JoinCompleteView(APIView):
    """``POST /api/v1/clubs/join/complete/`` — OTP -> pending roster request."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request: Request) -> Response:
        blocked = _throttled("join", JOIN_ATTEMPT_LIMIT, request)
        if blocked is not None:
            return blocked
        try:
            join_request = services.complete_join(
                passkey=str(request.data.get("passkey", "")).strip(),
                token=str(request.data.get("token", "")).strip(),
                email=str(request.data.get("email", "")).strip(),
                code=str(request.data.get("code", "")).strip(),
                request=request,
            )
        except ClubError as exc:
            return _error(exc)
        club = join_request.club
        return Response(
            {
                "id": join_request.pk,
                "status": join_request.status,
                "club": {"code": club.code, "name": club.name},
                "detail": "Join requested; the club admin confirms it in the roster.",
            },
            status=status.HTTP_201_CREATED,
        )


# --- Dashboard surface (W9: club authorities only, fresh password) --------


class DashboardView(APIView):
    """``GET /api/v1/clubs/dashboard/`` — the club admin's dashboard body."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def get(self, request: Request) -> Response:
        try:
            club = services.club_of(request.user)
        except ClubError as exc:
            return _error(exc)
        return Response(services.dashboard_payload(club=club))


class ShowcaseEditView(APIView):
    """``POST /api/v1/clubs/dashboard/showcase/`` — create/update the showcase."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def post(self, request: Request) -> Response:
        try:
            club = services.club_of(request.user)
            showcase = services.upsert_showcase(
                club=club,
                tagline=str(request.data.get("tagline", "")),
                about=str(request.data.get("about", "")),
                sections=request.data.get("sections"),
                request=request,
            )
        except ClubError as exc:
            return _error(exc)
        return Response(services.showcase_payload(showcase))


class PasskeyStatusView(APIView):
    """``GET /api/v1/clubs/dashboard/passkey/`` — status WITHOUT secrets."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def get(self, request: Request) -> Response:
        try:
            club = services.club_of(request.user)
        except ClubError as exc:
            return _error(exc)
        return Response({"passkey": services.passkey_payload(club)})


class PasskeyIssueView(APIView):
    """``POST /api/v1/clubs/dashboard/passkey/issue/`` — plaintext shown ONCE."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def post(self, request: Request) -> Response:
        try:
            club = services.club_of(request.user)
            code = services.issue_passkey(
                club=club, issued_by=request.user, request=request
            )
        except ClubError as exc:
            return _error(exc)
        return Response(
            {"passkey": code, "status": services.passkey_payload(club)},
            status=status.HTTP_201_CREATED,
        )


class PasskeyRegenerateView(APIView):
    """``POST /api/v1/clubs/dashboard/passkey/regenerate/`` — new code, old dead."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def post(self, request: Request) -> Response:
        try:
            club = services.club_of(request.user)
            code = services.regenerate_passkey(
                club=club, issued_by=request.user, request=request
            )
        except ClubError as exc:
            return _error(exc)
        return Response({"passkey": code, "status": services.passkey_payload(club)})


class PasskeyRevokeView(APIView):
    """``POST /api/v1/clubs/dashboard/passkey/revoke/`` — bounded repair (P5)."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def post(self, request: Request) -> Response:
        try:
            club = services.club_of(request.user)
            status_payload = services.revoke_passkey(club=club, request=request)
        except ClubError as exc:
            return _error(exc)
        return Response({"passkey": status_payload})


class JoinUrlView(APIView):
    """``GET /api/v1/clubs/dashboard/passkey/join-url/`` — fresh signed join URL.

    Re-minted on every call (dynamic): the token is short-lived and
    club-bound (W5), and the raw passkey is never in it.
    """

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def get(self, request: Request) -> Response:
        try:
            club = services.club_of(request.user)
            token, expires_at = services.mint_join_token(club=club)
        except ClubError as exc:
            return _error(exc)
        path = services.join_path_for(token=token)
        response = Response(
            {
                "join_url": request.build_absolute_uri(path),
                "expires_at": expires_at,
            }
        )
        response["Cache-Control"] = "no-store"
        return response


class PasskeyQrView(APIView):
    """``GET /api/v1/clubs/dashboard/passkey/qr.svg`` — the dynamic QR.

    Wraps a FRESH signed join URL on every page load (BRIEF_M4 §4c): the
    image is generated per request and never cached (``no-store``).
    """

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def get(self, request: Request) -> HttpResponse:
        try:
            club = services.club_of(request.user)
            token, _expires_at = services.mint_join_token(club=club)
            svg = services.render_join_qr_svg(
                request.build_absolute_uri(services.join_path_for(token=token))
            )
        except ClubError as exc:
            return Response(
                {"detail": exc.message, "code": exc.code}, status=exc.http_status
            )
        response = HttpResponse(svg, content_type="image/svg+xml")
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class RenewalRequestView(APIView):
    """``POST /api/v1/clubs/renewal/request/`` — Path A step 1 (M6 D5 Q1).

    A club authority asks for renewal; the EMP issues or rejects from the
    zone desk. Exactly one open request per club (server-side, P0).
    """

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def post(self, request: Request) -> Response:
        note = request.data.get("note", "")
        try:
            record = request_renewal(
                request.user, note=str(note)[:500], request=request
            )
        except GovernanceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(record_payload(record), status=status.HTTP_201_CREATED)


class CanonicalClubsListView(APIView):
    """GET /api/v1/clubs/ -- public single source for institutional clubs."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        from apps.domain.clubs import get_all_canonical_clubs

        clubs = get_all_canonical_clubs()
        return Response({"clubs": clubs, "count": len(clubs)})
