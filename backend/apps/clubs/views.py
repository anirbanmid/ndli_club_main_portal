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

import re
from typing import Any

from django.http import HttpResponse
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.policies import CLUB_AUTHORITY_GATE
from apps.accounts.throttles import client_ip, sliding_window_allow
from apps.core.scoping import authenticated_user
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


def _resolve_club_for_subclubs(club_code: str):
    from django.db.models import Q

    from apps.domain.models import Club

    club_code_clean = str(club_code).strip()
    if not club_code_clean:
        return None

    # 1. Match by code (e.g. CLUB-BHU-008)
    club = Club.objects.filter(code__iexact=club_code_clean).first()
    if club:
        return club

    # 2. Match by primary key
    if club_code_clean.isdigit():
        club = Club.objects.filter(pk=int(club_code_clean)).first()
        if club:
            return club

    # 3. Match by legacy ID, institution code, or registration number
    club = Club.objects.filter(
        Q(institution__legacy_id__iexact=club_code_clean)
        | Q(institution__code__iexact=club_code_clean)
        | Q(registration_no__iexact=club_code_clean)
    ).first()
    if club:
        return club

    # 4. Match by slug token (e.g. 'bhu-main', 'bhu')
    slug_token = (
        club_code_clean.lower()
        .replace("-main", "")
        .replace("_main", "")
        .replace("-", "")
        .replace("_", "")
    )
    if len(slug_token) >= 2:
        return Club.objects.filter(
            Q(code__icontains=slug_token) | Q(name__icontains=slug_token)
        ).first()
    return None


class SubClubListView(APIView):
    """List or create disciplinary sub-clubs under an HEI main club."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def get(self, request: Request, club_code: str) -> Response:
        from apps.domain.models import SubClub

        club = _resolve_club_for_subclubs(club_code)
        if not club:
            return Response(
                {"detail": "Club not found.", "code": "club_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        sub_clubs = SubClub.objects.filter(club=club, is_active=True).order_by("name")
        data = [
            {
                "id": sc.id,
                "club_id": club.code,
                "code": sc.code,
                "name": sc.name,
                "discipline": sc.discipline,
                "coordinator_name": sc.coordinator_name,
                "coordinator_email": sc.coordinator_email,
                "coordinator_phone": sc.coordinator_phone,
                "is_active": sc.is_active,
                "created_at": (
                    sc.created_at.isoformat()
                    if hasattr(sc.created_at, "isoformat")
                    else str(sc.created_at)
                ),
                "member_count": sc.enrolled_students.count(),
                "members_count": sc.enrolled_students.count(),
            }
            for sc in sub_clubs
        ]
        return Response({"sub_clubs": data, "count": len(data)})

    def post(self, request: Request, club_code: str) -> Response:
        import secrets

        from apps.domain.models import SubClub

        club = _resolve_club_for_subclubs(club_code)
        if not club:
            return Response(
                {"detail": "Club not found.", "code": "club_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data
        name = str(data.get("name", "")).strip()
        discipline = str(data.get("discipline", "")).strip()
        if not name:
            return Response(
                {"detail": "Sub-club name is required.", "code": "missing_name"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Generate unique code
        slug_part = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").upper()
        code = f"{club.code}-SUB-{slug_part[:12]}-{secrets.token_hex(2).upper()}"

        from apps.core.scoping import authenticated_user

        user = authenticated_user(request)
        if not user:
            return Response(
                {"detail": "Authenticated authority required to create sub-clubs."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # H6: require club authority for sub-club creation
        from apps.members.views import _is_main_club_authority

        if not _is_main_club_authority(user, club):
            return Response(
                {"detail": "Club authority required to create sub-clubs."},
                status=status.HTTP_403_FORBIDDEN,
            )

        sub_club = SubClub.objects.create(
            club=club,
            code=code,
            name=name,
            discipline=discipline,
            created_by=user,
            coordinator_name=str(data.get("coordinator_name", "")).strip(),
            coordinator_email=str(data.get("coordinator_email", "")).strip(),
            coordinator_phone=str(data.get("coordinator_phone", "")).strip(),
        )
        return Response(
            {
                "id": sub_club.id,
                "code": sub_club.code,
                "name": sub_club.name,
                "discipline": sub_club.discipline,
                "coordinator_name": sub_club.coordinator_name,
                "coordinator_email": sub_club.coordinator_email,
                "coordinator_phone": sub_club.coordinator_phone,
                "message": "Sub-club created successfully.",
            },
            status=status.HTTP_201_CREATED,
        )


class SubClubDetailView(APIView):
    """Update or toggle sub-club / coordinator."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def patch(self, request: Request, club_code: str, subclub_id: int) -> Response:
        from apps.domain.models import SubClub

        club = _resolve_club_for_subclubs(club_code)
        if not club:
            return Response(
                {"detail": "Club not found.", "code": "club_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        sub_club = SubClub.objects.filter(id=subclub_id, club=club).first()
        if not sub_club:
            return Response(
                {"detail": "Sub-club not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # H6: require club authority for sub-club edit
        from apps.members.views import _is_main_club_authority

        if not _is_main_club_authority(authenticated_user(request), club):
            return Response(
                {"detail": "Club authority required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data
        for field in (
            "name",
            "discipline",
            "coordinator_name",
            "coordinator_email",
            "coordinator_phone",
        ):
            if field in data:
                setattr(sub_club, field, str(data[field]).strip())
        if "is_active" in data:
            sub_club.is_active = bool(data["is_active"])
        sub_club.save()

        return Response(
            {
                "id": sub_club.id,
                "code": sub_club.code,
                "name": sub_club.name,
                "discipline": sub_club.discipline,
                "coordinator_name": sub_club.coordinator_name,
                "coordinator_email": sub_club.coordinator_email,
                "coordinator_phone": sub_club.coordinator_phone,
                "is_active": sub_club.is_active,
                "message": "Sub-club updated successfully.",
            }
        )


class ClubBrandingView(APIView):
    """Institutional branding: Transparent PNG logo and Signing Authority Signature."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request, club_code: str) -> Response:
        from apps.domain.models import Club

        club = (
            Club.objects.select_related("institution")
            .filter(code__iexact=club_code)
            .first()
        )
        if not club or not getattr(club, "institution", None):
            return Response(
                {
                    "institution_name": club.name if club else club_code,
                    "institution_type": "higher_education",
                    "affiliation_code": "",
                    "signing_authority_name": "",
                    "signing_authority_affiliation": "",
                    "has_logo": False,
                    "logo_url": "",
                    "has_signature": False,
                    "signature_url": "",
                }
            )

        inst = club.institution
        logo_url = ""
        if inst.logo_image:
            try:
                logo_url = inst.logo_image.url
            except Exception:
                logo_url = ""

        sig_url = ""
        if inst.signature_image:
            try:
                sig_url = inst.signature_image.url
            except Exception:
                sig_url = ""

        return Response(
            {
                "institution_name": inst.name,
                "institution_type": getattr(
                    inst, "institution_type", "higher_education"
                ),
                "affiliation_code": getattr(inst, "affiliation_code", ""),
                "signing_authority_name": getattr(inst, "signing_authority_name", ""),
                "signing_authority_affiliation": getattr(
                    inst, "signing_authority_affiliation", ""
                ),
                "has_logo": bool(inst.logo_image),
                "logo_url": logo_url,
                "has_signature": bool(inst.signature_image),
                "signature_url": sig_url,
            }
        )

    def post(self, request: Request, club_code: str) -> Response:
        from apps.domain.models import Club

        club = (
            Club.objects.select_related("institution")
            .filter(code__iexact=club_code)
            .first()
        )
        if not club or not getattr(club, "institution", None):
            return Response(
                {"detail": "Club not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # H6: require club authority for branding changes
        from apps.members.views import _is_main_club_authority

        if not _is_main_club_authority(authenticated_user(request), club):
            return Response(
                {"detail": "Club authority required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        inst = club.institution
        if "logo_image" in request.FILES:
            inst.logo_image = request.FILES["logo_image"]
        if "signature_image" in request.FILES:
            inst.signature_image = request.FILES["signature_image"]
        if "signing_authority_name" in request.data:
            inst.signing_authority_name = str(
                request.data["signing_authority_name"]
            ).strip()
        if "signing_authority_affiliation" in request.data:
            inst.signing_authority_affiliation = str(
                request.data["signing_authority_affiliation"]
            ).strip()

        inst.save()
        logo_url = ""
        if inst.logo_image:
            try:
                logo_url = inst.logo_image.url
            except Exception:
                logo_url = ""

        sig_url = ""
        if inst.signature_image:
            try:
                sig_url = inst.signature_image.url
            except Exception:
                sig_url = ""

        return Response(
            {
                "message": "Institutional branding assets saved successfully.",
                "has_logo": bool(inst.logo_image),
                "logo_url": logo_url,
                "has_signature": bool(inst.signature_image),
                "signature_url": sig_url,
                "signing_authority_name": inst.signing_authority_name,
                "signing_authority_affiliation": inst.signing_authority_affiliation,
            }
        )
