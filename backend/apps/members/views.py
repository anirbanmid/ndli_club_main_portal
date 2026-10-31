"""HTTP views for the Members app — M4 D3 roster-side join decisions.

The roster VIEW of pending campus self-joins: list, confirm, reject. All
three are club-activity-controlling (W9) — reachable ONLY by authenticated
club authorities with fresh password state, and every queryset/object is
scoped by the M2 scope keys (``ObjectScope("clubs")`` turns cross-club IDs
into 404, never data). Confirming is the ONLY path from a campus self-join
to a ``domain.Membership`` row (D3).
"""

from __future__ import annotations

from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.policies import CLUB_AUTHORITY_GATE, ObjectScope
from apps.core import scoping
from apps.core.scoping import authenticated_user

from . import services
from .models import JoinRequest
from .services import MemberError

#: Status filter allowlist for the roster view (no free-text lookups).
STATUS_FILTERS = {choice.value for choice in JoinRequest.Status}


def _error(exc: MemberError) -> Response:
    return Response({"detail": exc.message, "code": exc.code}, status=exc.http_status)


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
        return Response({"id": join_request.pk, "status": join_request.status})


class JoinBatchConfirmView(APIView):
    """Approve all or selected join requests."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        club_code = str(request.data.get("club_code", "")).strip()
        approve_all = bool(request.data.get("approve_all", False))
        request_ids = request.data.get("request_ids", None)

        if not club_code:
            return Response(
                {"detail": "club_code is required.", "code": "missing_club"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = services.batch_confirm_joins(
            club_code=club_code,
            decided_by=authenticated_user(request),
            request_ids=request_ids,
            approve_all=approve_all,
            request=request,
        )
        return Response(
            {"approved": results, "count": len(results)}, status=status.HTTP_200_OK
        )


class StudentProfileDetailView(APIView):
    """View, update validity or profile info for an HEI student member."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request, profile_id: int) -> Response:
        from apps.members.models import StudentMemberProfile

        profile = (
            StudentMemberProfile.objects.select_related("user", "club")
            .prefetch_related("sub_clubs")
            .filter(id=profile_id)
            .first()
        )
        if not profile:
            return Response(
                {"detail": "Student profile not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "id": profile.id,
                "username": profile.user.username,
                "email": profile.user.email,
                "club_code": profile.club.code,
                "gender": profile.gender,
                "department": profile.department,
                "roll_number": profile.roll_number,
                "validity_years": profile.validity_years,
                "valid_until": profile.valid_until,
                "is_suspended": profile.is_suspended_by_coordinator,
                "points": profile.points,
                "badge": profile.badge,
                "date_of_birth": profile.date_of_birth,
                "hobbies": profile.hobbies,
                "address": profile.address,
                "state": profile.state,
                "pincode": profile.pincode,
                "social_facebook": profile.social_facebook,
                "social_instagram": profile.social_instagram,
                "social_x": profile.social_x,
                "avatar_url": profile.avatar.url if profile.avatar else "",
                "sub_clubs": [
                    {"id": sc.id, "name": sc.name} for sc in profile.sub_clubs.all()
                ],
            }
        )

    def patch(self, request: Request, profile_id: int) -> Response:
        from datetime import timedelta

        from apps.members.models import StudentMemberProfile

        profile = StudentMemberProfile.objects.filter(id=profile_id).first()
        if not profile:
            return Response(
                {"detail": "Student profile not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data
        if "validity_years" in data:
            years = int(data["validity_years"])
            profile.validity_years = years
            profile.valid_until = timezone.localdate() + timedelta(days=365 * years)
        if "is_suspended" in data:
            profile.is_suspended_by_coordinator = bool(data["is_suspended"])
        if "department" in data:
            profile.department = str(data["department"]).strip()
        if "hobbies" in data:
            profile.hobbies = str(data["hobbies"]).strip()
        if "address" in data:
            profile.address = str(data["address"]).strip()
        if "state" in data:
            profile.state = str(data["state"]).strip()
        if "pincode" in data:
            profile.pincode = str(data["pincode"]).strip()
        if "social_facebook" in data:
            profile.social_facebook = str(data["social_facebook"]).strip()
        if "social_instagram" in data:
            profile.social_instagram = str(data["social_instagram"]).strip()
        if "social_x" in data:
            profile.social_x = str(data["social_x"]).strip()
        if "avatar" in request.FILES:
            profile.avatar = request.FILES["avatar"]

        profile.save()
        return Response({"message": "Profile updated successfully.", "id": profile.id})


class StudentSubClubAssignView(APIView):
    """Assign or remove Sub-Clubs for a student member."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request: Request, profile_id: int) -> Response:
        from apps.domain.models import SubClub
        from apps.members.models import StudentMemberProfile

        profile = StudentMemberProfile.objects.filter(id=profile_id).first()
        if not profile:
            return Response(
                {"detail": "Student profile not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        subclub_ids = request.data.get("subclub_ids", [])
        subclubs = SubClub.objects.filter(id__in=subclub_ids, club=profile.club)
        profile.sub_clubs.set(subclubs)
        return Response(
            {
                "message": "Sub-clubs updated successfully.",
                "sub_clubs": [sc.name for sc in subclubs],
            }
        )


class SchoolRosterUploadView(APIView):
    """Upload CSV for school students and auto-generate deterministic UIDs."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request: Request, club_code: str) -> Response:
        import csv
        import io

        if "file" not in request.FILES:
            return Response(
                {"detail": "CSV file is required.", "code": "missing_file"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uploaded = request.FILES["file"]
        decoded = uploaded.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(decoded))
        rows = [row for row in reader]

        try:
            result = services.process_school_roster_csv(
                club_code=club_code, csv_rows=rows
            )
        except MemberError as exc:
            return _error(exc)

        return Response(result, status=status.HTTP_201_CREATED)


class SchoolCardsListView(APIView):
    """List school membership cards with deterministic UIDs for printing."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, club_code: str) -> Response:
        from apps.domain.models import Club
        from apps.members.models import SchoolStudentRoster

        club = (
            Club.objects.select_related("institution")
            .filter(code__iexact=club_code)
            .first()
        )
        if not club:
            return Response(
                {"detail": "Club not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        students = SchoolStudentRoster.objects.filter(
            club=club, is_active=True
        ).order_by("student_class", "section", "full_name")
        cards = [
            {
                "id": s.id,
                "student_uid": s.student_uid,
                "full_name": s.full_name,
                "gender": s.gender,
                "student_class": s.student_class,
                "section": s.section,
                "school_name": club.institution.name,
                "club_code": club.code,
                "batch_year": s.batch_year,
                "qr_content": f"https://ndli.iitkgp.ac.in/verify/student/{s.student_uid}",
            }
            for s in students
        ]
        return Response(
            {"school_name": club.institution.name, "cards": cards, "total": len(cards)}
        )
