"""HTTP views for the Members app — M4 D3 roster-side join decisions.

The roster VIEW of pending campus self-joins: list, confirm, reject. All
three are club-activity-controlling (W9) — reachable ONLY by authenticated
club authorities with fresh password state, and every queryset/object is
scoped by the M2 scope keys (``ObjectScope("clubs")`` turns cross-club IDs
into 404, never data). Confirming is the ONLY path from a campus self-join
to a ``domain.Membership`` row (D3).
"""

from __future__ import annotations

from typing import Any

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
from .models import JoinRequest, RosterEntry
from .services import MemberError

#: Status filter allowlist for the roster view (no free-text lookups).
STATUS_FILTERS = {choice.value for choice in JoinRequest.Status}


class CheckPreapprovalView(APIView):
    """``POST /api/v1/members/check-preapproval/`` — public pre-approval check.

    Used by the student passkey join flow: a student enters passkey + email
    + full name, and the system checks whether a club authority has
    pre-approved them via bulk CSV upload (a ``RosterEntry`` row with the
    same club + email). No authentication is required — this is the public
    front door of the join flow.

    Returns:
        200 with ``{"match": true, ...}`` if a pre-approved RosterEntry
        exists for this club + email (name is also compared when provided).
        200 with ``{"match": false, ...}`` if no match.
        400 if the passkey is invalid.
    """

    permission_classes: list = []
    authentication_classes: list = []
    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        from django.conf import settings

        from apps.accounts.throttles import client_ip, sliding_window_allow
        from apps.clubs.services import resolve_passkey

        # M1: per-IP throttle to prevent passkey brute-force / oracle abuse
        # (skipped under TESTING so rapid in-suite calls do not trip 429s)
        if not getattr(settings, "TESTING", False) and not sliding_window_allow(
            f"m1:preapproval:{client_ip(request)}", 10, 60
        ):
            return Response(
                {"detail": "Too many attempts. Try again in a minute.",
                 "code": "throttled"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        data = request.data
        passkey = str(data.get("passkey", "")).strip()
        email = str(data.get("email", "")).strip().lower()
        full_name = str(data.get("full_name", "")).strip()

        if not passkey or not email:
            return Response(
                {
                    "detail": "Passkey and email are both required.",
                    "code": "missing_fields",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve passkey to a club
        try:
            passkey_row = resolve_passkey(passkey)
            club = passkey_row.club
        except Exception:
            return Response(
                {
                    "detail": "Invalid institutional passkey.",
                    "code": "invalid_passkey",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Look for a pre-approved RosterEntry matching this club + email
        entry = (
            RosterEntry.objects.filter(club=club, email__iexact=email)
            .select_related("club")
            .first()
        )

        if entry is None:
            return Response(
                {
                    "match": False,
                    "message": (
                        "No record found. Please create a password and submit "
                        "for final approval by your institution authority."
                    ),
                    "club_code": club.code,
                    "institution_name": club.institution.name,
                },
                status=status.HTTP_200_OK,
            )

        # Match found — optionally cross-check full name when provided
        name_matches = True
        if full_name:
            name_matches = entry.name.strip().lower() == full_name.strip().lower()

        if not name_matches:
            return Response(
                {
                    "match": False,
                    "message": (
                        "No record found with this name. Please create a "
                        "password and submit for final approval by your "
                        "institution authority."
                    ),
                    "club_code": club.code,
                    "institution_name": club.institution.name,
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {
                "match": True,
                "message": (
                    "Your membership has already been approved by your "
                    "institution authority. Please create a password for "
                    "final onboarding."
                ),
                "club_code": club.code,
                "institution_name": club.institution.name,
                "roster_entry_id": entry.pk,
                "roster_name": entry.name,
                "roster_email": entry.email,
                # Cross-institution check: is this email already a member
                # at any OTHER institution?
                "cross_institution_match": _find_cross_institution_match(email, club),
            },
            status=status.HTTP_200_OK,
        )


def _find_cross_institution_match(email: str, current_club) -> dict | None:
    """Check if ``email`` is already a member at any club OTHER than
    ``current_club``. Returns match info dict or ``None``."""
    from apps.members.models import StudentMemberProfile

    profile = (
        StudentMemberProfile.objects.select_related("club", "club__institution")
        .filter(user__email__iexact=email)
        .exclude(club=current_club)
        .first()
    )
    if profile is None:
        return None
    return {
        "club_code": profile.club.code,
        "club_name": profile.club.name,
        "institution_name": profile.club.institution.name,
    }


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


def _is_main_club_authority(actor: Any, club: Any) -> bool:
    """Verify if actor is an authorized main club officer.

    Includes Patron, President, Secretary, and Executive Committee members.
    """
    from apps.accounts.models import CLUB_AUTHORITY_SUB_ROLES, Category

    if actor is None or not getattr(actor, "is_authenticated", False):
        return False
    actor_category = getattr(actor, "category", None)
    if actor_category == Category.IIT_KGP_ADMIN:
        return True
    actor_sub_role = getattr(actor, "sub_role", None)
    if (
        actor_category != Category.CLUB_ADMIN
        or actor_sub_role not in CLUB_AUTHORITY_SUB_ROLES
    ):
        return False
    actor_club = getattr(actor, "club", None)
    if actor_club is None or club is None or actor_club.pk != club.pk:
        return False
    return True


def _is_subclub_coordinator(
    actor: Any, club: Any, subclub_ids: list[int] | None = None
) -> bool:
    """Verify if actor is an assigned coordinator for a sub-club."""
    if actor is None or not getattr(actor, "is_authenticated", False):
        return False
    from apps.domain.models import SubClub

    actor_email = getattr(actor, "email", "") or ""
    if not actor_email:
        return False
    qs = SubClub.objects.filter(
        club=club,
        coordinator_email__iexact=actor_email,
        is_active=True,
    )
    if subclub_ids is not None:
        qs = qs.filter(id__in=subclub_ids)
    return qs.exists()


class JoinBatchConfirmView(APIView):
    """Approve all or selected join requests."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        actor = request.user
        club_code = str(request.data.get("club_code", "")).strip()
        approve_all = bool(request.data.get("approve_all", False))
        request_ids = request.data.get("request_ids", None)

        if not club_code:
            return Response(
                {"detail": "club_code is required.", "code": "missing_club"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.domain.models import Club

        target_club = Club.objects.filter(code__iexact=club_code).first()
        if not target_club:
            return Response(
                {"detail": "Club not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not _is_main_club_authority(actor, target_club):
            return Response(
                {
                    "detail": (
                        "Only main club authorities can approve membership requests."
                    ),
                    "code": "permission_denied",
                },
                status=status.HTTP_403_FORBIDDEN,
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
        actor = request.user
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

        caller_is_auth = _is_main_club_authority(actor, profile.club)
        caller_is_coord = _is_subclub_coordinator(actor, profile.club)
        caller_is_self = getattr(actor, "pk", None) == profile.user_id
        if not caller_is_auth and not caller_is_coord and not caller_is_self:
            return Response(
                {
                    "detail": (
                        "You do not have permission to view this student profile."
                    ),
                    "code": "permission_denied",
                },
                status=status.HTTP_403_FORBIDDEN,
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
        actor = request.user
        from datetime import timedelta

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

        student_subclub_ids = list(profile.sub_clubs.values_list("id", flat=True))
        caller_is_main_auth = _is_main_club_authority(actor, profile.club)
        caller_is_coord = _is_subclub_coordinator(
            actor, profile.club, student_subclub_ids
        )

        if not caller_is_main_auth and not caller_is_coord:
            return Response(
                {
                    "detail": (
                        "Permission denied. Only club authorities or assigned "
                        "sub-club coordinators may modify student records."
                    ),
                    "code": "permission_denied",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data
        if "validity_years" in data:
            if not caller_is_main_auth:
                return Response(
                    {
                        "detail": (
                            "Only main club authorities can update membership validity."
                        ),
                        "code": "permission_denied",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
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
            from apps.core.uploads import validate_image_upload

            validate_image_upload(request.FILES["avatar"])
            profile.avatar = request.FILES["avatar"]

        profile.save()
        return Response({"message": "Profile updated successfully.", "id": profile.id})

    def delete(self, request: Request, profile_id: int) -> Response:
        actor = request.user
        from apps.accounts.models import AccountState
        from apps.domain.models import Membership
        from apps.members.models import JoinRequest, StudentMemberProfile

        profile = (
            StudentMemberProfile.objects.select_related("user", "club")
            .filter(id=profile_id)
            .first()
        )
        if not profile:
            return Response(
                {"detail": "Student profile not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not _is_main_club_authority(actor, profile.club):
            return Response(
                {
                    "detail": (
                        "Only main club authorities of this club can permanently "
                        "remove a student member."
                    ),
                    "code": "permission_denied",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        user = profile.user
        club = profile.club

        from django.db import transaction

        with transaction.atomic():
            Membership.objects.filter(user=user, club=club).delete()
            JoinRequest.objects.filter(user=user, club=club).delete()
            profile.delete()
            user.club_id = ""
            user.institution_id = ""
            user.account_state = AccountState.DORMANT
            user.save(update_fields=["club", "institution", "account_state"])

        return Response(
            {
                "message": "Student member removed permanently from the club.",
                "success": True,
            }
        )


class StudentSubClubAssignView(APIView):
    """Assign or remove Sub-Clubs for a student member."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request: Request, profile_id: int) -> Response:
        actor = request.user
        from apps.domain.models import SubClub
        from apps.members.models import StudentMemberProfile

        profile = (
            StudentMemberProfile.objects.select_related("club")
            .filter(id=profile_id)
            .first()
        )
        if not profile:
            return Response(
                {"detail": "Student profile not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not _is_main_club_authority(actor, profile.club):
            return Response(
                {
                    "detail": (
                        "Only main club authorities can assign sub-clubs to students."
                    ),
                    "code": "permission_denied",
                },
                status=status.HTTP_403_FORBIDDEN,
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

        from apps.domain.models import Club

        # H4: require main-club authority for roster upload
        club = (
            Club.objects.select_related("institution")
            .filter(code__iexact=club_code)
            .first()
        )
        if not club or not _is_main_club_authority(authenticated_user(request), club):
            return Response(
                {"detail": "Forbidden.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if "file" not in request.FILES:
            return Response(
                {"detail": "CSV file is required.", "code": "missing_file"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uploaded = request.FILES["file"]
        raw_bytes = uploaded.read()
        try:
            decoded = raw_bytes.decode("utf-8-sig")
        except Exception:
            decoded = raw_bytes.decode("latin-1")
        reader = csv.DictReader(io.StringIO(decoded))
        rows = [row for row in reader]

        try:
            result = services.process_school_roster_csv(
                club_code=club_code, csv_rows=rows
            )
        except MemberError as exc:
            return _error(exc)

        return Response(result, status=status.HTTP_201_CREATED)


class SchoolRosterPendingListView(APIView):
    """``GET /api/v1/members/school/<club_code>/pending/`` — staged (not yet
    approved) school roster entries awaiting authority approval."""

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

        # H4: require main-club authority for pending roster read
        if not _is_main_club_authority(authenticated_user(request), club):
            return Response(
                {"detail": "Forbidden.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        entries = (
            SchoolStudentRoster.objects.filter(club=club, status="pending")
            .order_by("student_class", "section", "full_name")
        )
        return Response(
            {
                "club_code": club.code,
                "club_name": club.name,
                "pending_count": entries.count(),
                "entries": [
                    {
                        "id": e.id,
                        "student_uid": e.student_uid,
                        "full_name": e.full_name,
                        "gender": e.gender,
                        "student_class": e.student_class,
                        "section": e.section,
                        "guardian_phone": e.guardian_phone,
                        "batch_year": e.batch_year,
                        "created_at": (
                            e.created_at.isoformat() if e.created_at else None
                        ),
                    }
                    for e in entries
                ],
            }
        )


class _SchoolRosterDecisionView(APIView):
    """Base for approve/reject: toggle status + is_active on entry IDs."""

    permission_classes = [IsAuthenticated]

    def _resolve_club(self, club_code: str):
        from apps.domain.models import Club

        return (
            Club.objects.select_related("institution")
            .filter(code__iexact=club_code)
            .first()
        )

    def _apply(self, request, club_code: str, target_status: str) -> Response:
        from apps.members.models import SchoolStudentRoster

        club = self._resolve_club(club_code)
        if not club:
            return Response(
                {"detail": "Club not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # H4: require main-club authority for roster approve/reject
        if not _is_main_club_authority(authenticated_user(request), club):
            return Response(
                {"detail": "Forbidden.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        entry_ids = request.data.get("entry_ids", [])
        if not isinstance(entry_ids, list) or not entry_ids:
            return Response(
                {
                    "detail": "entry_ids (non-empty list) is required.",
                    "code": "missing_entry_ids",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = SchoolStudentRoster.objects.filter(
            club=club, id__in=entry_ids, status="pending"
        )
        is_approved = target_status == "approved"
        updated = qs.update(status=target_status, is_active=is_approved)

        return Response(
            {
                "club_code": club.code,
                "status": target_status,
                "requested": len(entry_ids),
                "updated": updated,
                "detail": f"{updated} entr"
                f"{'y' if updated == 1 else 'ies'} {target_status}d.",
            }
        )


class SchoolRosterApproveView(_SchoolRosterDecisionView):
    """Approve pending school roster entries."""

    def post(self, request: Request, club_code: str) -> Response:
        return self._apply(request, club_code, "approved")


class SchoolRosterRejectView(_SchoolRosterDecisionView):
    """Reject pending school roster entries."""

    def post(self, request: Request, club_code: str) -> Response:
        return self._apply(request, club_code, "rejected")


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

        # H4: require main-club authority for school cards
        if not _is_main_club_authority(authenticated_user(request), club):
            return Response(
                {"detail": "Forbidden.", "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
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


class StudentProfileListView(APIView):
    """List existing student members with filters for Year, Dept, Gender, Sub-Club."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        from django.db.models import Q

        from apps.accounts.models import AccountState, Category
        from apps.members.models import StudentMemberProfile

        actor = request.user
        if not getattr(actor, "is_authenticated", False):
            return Response(
                {"detail": "Authentication required."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        actor_category = getattr(actor, "category", None)
        try:
            actor_club = getattr(actor, "club", None)
        except Exception:
            actor_club = None
        club_code = str(request.query_params.get("club_code", "")).strip()

        # H5: reject ALL student access to roster (not just when club_code absent)
        if actor_category == Category.STUDENT_MEMBER:
            return Response(
                {
                    "detail": "Students cannot access club management rosters.",
                    "code": "permission_denied",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # H5: cross-club reads require main-club authority
        if actor_category == Category.CLUB_ADMIN and actor_club is not None:
            if club_code and actor_club.code.lower() != club_code.lower():
                return Response(
                    {
                        "detail": "Access to another club's roster is forbidden.",
                        "code": "permission_denied",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
        qs = (
            StudentMemberProfile.objects.filter(user__account_state=AccountState.ACTIVE)
            .select_related("user", "club", "club__institution")
            .prefetch_related("sub_clubs")
        )

        if club_code:
            qs = qs.filter(club__code__iexact=club_code)
        elif actor_club:
            qs = qs.filter(club=actor_club)

        department = str(request.query_params.get("department", "")).strip()
        if department:
            qs = qs.filter(department__icontains=department)

        gender = str(request.query_params.get("gender", "")).strip()
        if gender:
            qs = qs.filter(gender__iexact=gender)

        year = request.query_params.get("year")
        if year:
            try:
                y = int(year)
                qs = qs.filter(Q(created_at__year=y) | Q(valid_until__year=y))
            except (ValueError, TypeError):
                pass

        sub_club_id = request.query_params.get("sub_club_id")
        if sub_club_id:
            try:
                qs = qs.filter(sub_clubs__id=int(sub_club_id))
            except (ValueError, TypeError):
                pass

        main_club_only = request.query_params.get("main_club_only")
        if str(main_club_only).lower() in ("true", "1", "yes"):
            qs = qs.filter(sub_clubs__isnull=True)

        search = str(request.query_params.get("search", "")).strip()
        if search:
            qs = qs.filter(
                Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(user__username__icontains=search)
                | Q(user__email__icontains=search)
                | Q(roll_number__icontains=search)
                | Q(department__icontains=search)
            )

        today = timezone.localdate()
        results = []
        for p in qs.distinct().order_by("roll_number", "id"):
            is_expired = bool(p.valid_until and p.valid_until < today)
            status_str = (
                "suspended"
                if p.is_suspended_by_coordinator
                else ("expired" if is_expired else "active")
            )
            results.append(
                {
                    "id": p.id,
                    "user_id": p.user_id,
                    "full_name": p.user.get_full_name() or p.user.username,
                    "email": p.user.email,
                    "gender": p.gender,
                    "department": p.department,
                    "roll_number": p.roll_number,
                    "validity_years": p.validity_years,
                    "valid_until": p.valid_until,
                    "is_suspended": p.is_suspended_by_coordinator,
                    "is_expired": is_expired,
                    "status": status_str,
                    "points": p.points,
                    "badge": p.badge,
                    "sub_clubs": [
                        {"id": sc.id, "name": sc.name} for sc in p.sub_clubs.all()
                    ],
                    "joined_at": p.created_at,
                }
            )

        return Response({"results": results, "total": len(results)})


class StudentJoinRegisterView(APIView):
    """POST /api/v1/members/students/register/ -- Student Passkey Join enrollment."""

    permission_classes: list = []
    authentication_classes: list = []
    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        from datetime import timedelta

        from django.conf import settings
        from django.db import transaction

        from apps.accounts.models import AccountState, Category, SubRole, User

        # C4(e): per-IP throttle to prevent mass enrollment / brute-force
        # (skipped under TESTING so rapid in-suite calls do not trip 429s)
        from apps.accounts.throttles import client_ip, sliding_window_allow
        from apps.clubs import services as club_services
        from apps.members.models import JoinRequest, StudentMemberProfile

        if not getattr(settings, "TESTING", False) and not sliding_window_allow(
            f"members:register:{client_ip(request)}", 10, 60
        ):
            return Response(
                {"detail": "Too many attempts. Try again in a minute.",
                 "code": "throttled"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        data = request.data
        passkey = str(data.get("passkey", "")).strip()
        full_name = str(data.get("full_name", "")).strip()
        gender = str(data.get("gender", "other")).strip().lower()
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", "")).strip()
        department = str(data.get("department", "")).strip()
        roll_number = str(data.get("roll_number", "")).strip()
        # C4(b): activation is NEVER client-controlled — the server derives it
        # from the roster pre-approval / settings below.

        if (
            not passkey
            or not full_name
            or not email
            or not password
        ):
            return Response(
                {
                    "detail": (
                        "Passkey, Full Name, Email, and Password are all required."
                    ),
                    "code": "missing_fields",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if gender not in ("male", "female", "other"):
            gender = "other"

        # Resolve Club via Passkey ONLY (C4c): the previous fallback accepted a
        # public club/institution code as an enrollment credential.
        club = None
        try:
            passkey_row = club_services.resolve_passkey(passkey)
            club = passkey_row.club
        except Exception:
            passkey_row = None

        if not club:
            return Response(
                {
                    "detail": (
                        "Invalid institutional passkey. Please verify with your "
                        "college library or club authority."
                    ),
                    "code": "invalid_passkey",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Pre-approval check: has the club authority pre-uploaded this student
        # via bulk CSV? If yes, auto-activate (no authority approval, no email).
        preapproved_entry = None
        try:
            preapproved_entry = RosterEntry.objects.filter(
                club=club, email__iexact=email
            ).first()
        except Exception:
            preapproved_entry = None

        # Name cross-check when a full name was provided
        name_matches = True
        if preapproved_entry is not None and full_name:
            name_matches = (
                preapproved_entry.name.strip().lower()
                == full_name.strip().lower()
            )

        from django.conf import settings

        auto_activate = bool(
            (preapproved_entry is not None and name_matches)
            or getattr(settings, "AUTO_ACTIVATE_STUDENTS", False)
            or (settings.DEBUG and not getattr(settings, "TESTING", False))
        )

        existing_user = User.objects.filter(email__iexact=email).first()
        if existing_user is not None:
            from apps.domain.models import Membership

            # C4(a): hard-fail for any non-student account — blocks privileged
            # account takeover via re-registration.  Students without an active
            # membership are allowed (cross-institution transfer re-registration).
            if existing_user.category != Category.STUDENT_MEMBER:
                return Response(
                    {
                        "detail": (
                            "An active account with this email address is already "
                            "registered in a club."
                        ),
                        "code": "email_exists",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            has_active_membership = Membership.objects.filter(
                user=existing_user, status=Membership.Status.ACTIVE
            ).exists()
            has_active_profile = StudentMemberProfile.objects.filter(
                user=existing_user
            ).exists()
            if has_active_membership or has_active_profile:
                return Response(
                    {
                        "detail": (
                            "An active account with this email address is already "
                            "registered in a club."
                        ),
                        "code": "email_exists",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # C4(d): enforce password policy before any set_password call
        from apps.accounts.passwords import validate_password_strength

        try:
            validate_password_strength(password)
        except Exception:
            return Response(
                {
                    "detail": (
                        "Password does not meet strength requirements. "
                        "Minimum 10 characters with mixed character types."
                    ),
                    "code": "weak_password",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        username = email
        if (
            User.objects.filter(username__iexact=username)
            .exclude(email__iexact=email)
            .exists()
        ):
            import secrets

            username = f"{email.split('@')[0]}_{secrets.token_hex(2)}"

        parts = full_name.split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""

        from django.conf import settings

        target_account_state = (
            AccountState.ACTIVE if auto_activate else AccountState.PENDING_APPROVAL
        )
        target_join_status = (
            JoinRequest.Status.APPROVED if auto_activate else JoinRequest.Status.PENDING
        )

        with transaction.atomic():
            if existing_user is not None:
                user = existing_user
                user.first_name = first_name
                user.last_name = last_name
                user.category = Category.STUDENT_MEMBER
                user.sub_role = SubRole.STUDENT_MEMBER
                user.club = club
                user.institution = club.institution
                user.state = club.institution.state
                user.zone = club.institution.state.zone
                user.account_state = target_account_state
                user.set_password(password)
                user.save()
            else:
                user = User(
                    username=username,
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                    category=Category.STUDENT_MEMBER,
                    sub_role=SubRole.STUDENT_MEMBER,
                    club=club,
                    institution=club.institution,
                    state=club.institution.state,
                    zone=club.institution.state.zone,
                    account_state=target_account_state,
                )
                user.set_password(password)
                user.save()

            default_expiry = timezone.localdate() + timedelta(days=365)
            # Use pre-approved roster data when department/roll_number not provided
            if not department and preapproved_entry is not None:
                department = preapproved_entry.program or preapproved_entry.name or ''
            if not roll_number and preapproved_entry is not None:
                email_prefix = preapproved_entry.email.split("@")[0]
                roll_number = preapproved_entry.admission_no or email_prefix or ""
            profile = StudentMemberProfile.objects.create(
                user=user,
                club=club,
                gender=gender,
                department=department,
                roll_number=roll_number,
                validity_years=1,
                valid_until=default_expiry,
                points=50,
                badge="copper",
            )

            JoinRequest.objects.create(
                user=user,
                club=club,
                source=JoinRequest.Source.PASSKEY,
                status=target_join_status,
                decided_by=user if auto_activate else None,
                decided_at=timezone.now() if auto_activate else None,
            )

            if auto_activate:
                from apps.domain.models import Membership

                Membership.objects.get_or_create(
                    user=user,
                    club=club,
                    defaults={
                        "joined_on": timezone.localdate(),
                        "role": Membership.Role.MEMBER,
                        "status": Membership.Status.ACTIVE,
                    },
                )
                # Link the pre-approved roster entry to the newly created user
                if preapproved_entry is not None and preapproved_entry.user is None:
                    preapproved_entry.user = user
                    preapproved_entry.save(update_fields=["user"])

        if auto_activate:
            if preapproved_entry is not None and name_matches:
                msg = (
                    "Final onboarding complete! Your account is active and "
                    "verified. You can log in immediately to access the Club "
                    "Member Module."
                )
            else:
                msg = (
                    "Enrollment successful! Your student member account is active "
                    "and verified. You can log in immediately to access the Club "
                    "Member Module."
                )
        else:
            msg = (
                "Your enrollment application has been submitted to the club "
                "authority for final approval. No email verification is needed."
            )

        return Response(
            {
                "success": True,
                "message": msg,
                "club_code": club.code,
                "institution_name": club.institution.name,
                "full_name": full_name,
                "roll_number": roll_number,
                "profile_id": profile.id,
            },
            status=status.HTTP_201_CREATED,
        )


class TerminateMembershipView(APIView):
    """``POST /api/v1/members/students/terminate-membership/`` — hard-delete a
    student's membership at a specific (old) institution.

    Used during cross-institution transfer: when a student's email is already
    a member at another institution, they consent to terminate that membership
    before onboarding into the new institution.

    Hard-deletes (no soft-delete): ``StudentMemberProfile``, ``Membership``,
    and ``JoinRequest`` for the (user, old-club) pair. The ``User`` account is
    preserved so the student can authenticate at the new institution.
    """

    permission_classes: list = []
    authentication_classes: list = []
    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        from django.conf import settings
        from django.db import transaction

        from apps.accounts.models import User
        from apps.accounts.throttles import client_ip, sliding_window_allow
        from apps.clubs import services as club_services
        from apps.domain.models import Club, Membership
        from apps.members.models import JoinRequest, StudentMemberProfile

        # C5: per-IP throttle (skipped under TESTING)
        if not getattr(settings, "TESTING", False) and not sliding_window_allow(
            f"members:terminate:{client_ip(request)}", 10, 60
        ):
            return Response(
                {"detail": "Too many attempts. Try again in a minute.",
                 "code": "throttled"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        data = request.data
        email = str(data.get("email", "")).strip().lower()
        club_code = str(data.get("club_code", "")).strip()
        # C5: require the NEW club's passkey as identity proof
        new_club_passkey = str(data.get("passkey", "")).strip()

        if not email or not club_code or not new_club_passkey:
            return Response(
                {
                    "detail": "Email, club_code, and passkey are all required.",
                    "code": "missing_fields",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # C5: resolve new club passkey — reject if invalid
        try:
            new_passkey_row = club_services.resolve_passkey(new_club_passkey)
            new_club = new_passkey_row.club
        except Exception:
            return Response(
                {"detail": "Invalid passkey.", "code": "invalid_passkey"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve the old club
        club = (
            Club.objects.select_related("institution")
            .filter(code__iexact=club_code)
            .first()
        )

        # C5: unify all not-found paths into a single 404 (no enumeration)
        if not club:
            return Response(
                {"detail": "Membership not found.", "code": "membership_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # C5: reject when new club == old club (no self-termination)
        if club.pk == new_club.pk:
            return Response(
                {
                    "detail": "Cannot terminate membership at the same club.",
                    "code": "same_club",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find the user by email
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            return Response(
                {"detail": "Membership not found.", "code": "membership_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Verify a membership actually exists at this club before deleting
        profile_exists = StudentMemberProfile.objects.filter(
            user=user, club=club
        ).exists()
        membership_exists = Membership.objects.filter(
            user=user, club=club
        ).exists()
        if not profile_exists and not membership_exists:
            return Response(
                {"detail": "Membership not found.", "code": "membership_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            # Hard-delete all membership-related records at the old club
            StudentMemberProfile.objects.filter(user=user, club=club).delete()
            Membership.objects.filter(user=user, club=club).delete()
            JoinRequest.objects.filter(user=user, club=club).delete()

        services._audit(
            "student.membership.terminated",
            request,
            actor=user,
            object_type="student_membership",
            club=club.pk,
            email=email,
            old_club_code=club_code,
            old_institution=club.institution.name,
        )

        return Response(
            {
                "success": True,
                "message": (
                    f"Your membership at {club.name} ({club_code}) has been "
                    "terminated. You can now proceed with onboarding at your "
                    "new institution."
                ),
                "email": email,
                "terminated_club_code": club.code,
                "terminated_institution": club.institution.name,
            },
            status=status.HTTP_200_OK,
        )


def _calculate_profile_completeness(profile: Any) -> int:
    checks = [
        bool(profile.avatar),
        bool(profile.date_of_birth),
        bool(profile.hobbies and profile.hobbies.strip()),
        bool(profile.address and profile.address.strip()),
        bool(profile.state and profile.state.strip()),
        bool(profile.pincode and profile.pincode.strip()),
        bool(profile.social_facebook or profile.social_instagram or profile.social_x),
    ]
    return int(round((sum(checks) / float(len(checks))) * 100))


def _compute_gamification(profile: Any, user: Any) -> tuple[int, str, int, int, int]:
    from apps.activities.models import EventAttendance
    from apps.certificates.models import Certificate
    from apps.sharing.models import CuratedLibrary

    completeness = _calculate_profile_completeness(profile)

    events_attended = EventAttendance.objects.filter(user=user).count()
    certs_count = (
        Certificate.objects.filter(holder=user).count()
        + EventAttendance.objects.filter(user=user, is_approved=True).count()
    )
    community_libs = CuratedLibrary.objects.filter(
        owner=user, is_published_to_community=True
    ).count()

    points = (
        (events_attended * 50)
        + (certs_count * 50)
        + (community_libs * 50)
        + (50 if completeness >= 100 else 0)
    )

    if points >= 500:
        badge = "platinum"
    elif points >= 250:
        badge = "gold"
    elif points >= 100:
        badge = "silver"
    else:
        badge = "copper"

    if profile.points != points or profile.badge != badge:
        profile.points = points
        profile.badge = badge
        profile.save(update_fields=["points", "badge"])

    return points, badge, completeness, events_attended, certs_count


class StudentMemberMeView(APIView):
    """GET, PATCH /api/v1/members/me/ -- Student personal profile & telemetrics."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request) -> Response:
        from apps.members.models import StudentMemberProfile

        user = request.user
        profile = getattr(user, "student_profile", None)
        if not profile:
            club = None
            try:
                club = user.club
            except Exception:
                club = None
            if not club:
                from apps.domain.models import Club

                club = (
                    Club.objects.filter(is_sample=False, status="active").first()
                    or Club.objects.first()
                )
            if club:
                from datetime import timedelta

                profile, _ = StudentMemberProfile.objects.get_or_create(
                    user=user,
                    club=club,
                    defaults={
                        "roll_number": user.username,
                        "department": "General",
                        "gender": "other",
                        "validity_years": 1,
                        "valid_until": timezone.localdate() + timedelta(days=365),
                    },
                )

        if not profile:
            return Response(
                {"detail": "Student profile not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        points, badge, completeness, events_attended, certs_count = (
            _compute_gamification(profile, user)
        )

        age = None
        if profile.date_of_birth:
            today = timezone.localdate()
            dob = profile.date_of_birth
            age = (
                today.year
                - dob.year
                - ((today.month, today.day) < (dob.month, dob.day))
            )

        passkey = ""
        if hasattr(profile.club, "passkey") and profile.club.passkey:
            passkey = profile.club.passkey
        else:
            passkey = profile.club.code

        return Response(
            {
                "profile": {
                    "id": profile.id,
                    "user_id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "full_name": user.get_full_name() or user.username,
                    "gender": profile.gender,
                    "department": profile.department,
                    "roll_number": profile.roll_number,
                    "validity_years": profile.validity_years,
                    "valid_until": profile.valid_until,
                    "is_suspended": profile.is_suspended_by_coordinator,
                    "avatar_url": profile.avatar.url if profile.avatar else "",
                    "date_of_birth": profile.date_of_birth,
                    "age": age,
                    "hobbies": profile.hobbies,
                    "address": profile.address,
                    "state": profile.state,
                    "pincode": profile.pincode,
                    "social_facebook": profile.social_facebook,
                    "social_instagram": profile.social_instagram,
                    "social_x": profile.social_x,
                    "club": {
                        "code": profile.club.code if profile.club else "",
                        "name": profile.club.name if profile.club else "",
                        "institution_name": (
                            profile.club.institution.name
                            if (profile.club and profile.club.institution)
                            else (profile.club.name if profile.club else "")
                        ),
                        "passkey": passkey,
                    },
                    "sub_clubs": [
                        {"id": sc.id, "name": sc.name} for sc in profile.sub_clubs.all()
                    ],
                },
                "stats": {
                    "points": points,
                    "badge": badge,
                    "badge_label": badge.capitalize(),
                    "profile_completeness": completeness,
                    "streak_days": 5,
                    "events_attended": events_attended,
                    "certificates_earned": certs_count,
                    "next_tier_points": 100
                    if points < 100
                    else (250 if points < 250 else (500 if points < 500 else 1000)),
                },
            }
        )

    def patch(self, request: Request) -> Response:

        user = request.user
        profile = getattr(user, "student_profile", None)
        if not profile:
            return Response(
                {"detail": "Student profile not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if profile.is_suspended_by_coordinator:
            return Response(
                {
                    "detail": (
                        "Your account is temporarily suspended by your coordinator."
                    ),
                    "code": "account_suspended",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if profile.valid_until and profile.valid_until < timezone.localdate():
            return Response(
                {
                    "detail": "Your student membership validity has expired.",
                    "code": "membership_expired",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data
        if "department" in data:
            profile.department = str(data["department"]).strip()
        if "gender" in data and data["gender"] in ("male", "female", "other"):
            profile.gender = data["gender"]
        if "date_of_birth" in data and data["date_of_birth"]:
            profile.date_of_birth = data["date_of_birth"]
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
            from apps.core.uploads import validate_image_upload

            validate_image_upload(request.FILES["avatar"])
            profile.avatar = request.FILES["avatar"]

        profile.save()
        points, badge, _completeness, _events, _certs = _compute_gamification(
            profile, user
        )
        return Response(
            {
                "message": "Profile updated successfully.",
                "id": profile.id,
                "points": points,
                "badge": badge,
            }
        )


class StudentMemberMeSubClubsView(APIView):
    """POST /api/v1/members/me/subclubs/ -- Student self-selects preferred sub-clubs."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        from apps.domain.models import SubClub

        actor = request.user
        profile = getattr(actor, "student_profile", None)
        if not profile:
            return Response(
                {"detail": "Student profile not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if profile.is_suspended_by_coordinator:
            return Response(
                {
                    "detail": (
                        "Your account is temporarily suspended by your coordinator."
                    ),
                    "code": "account_suspended",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if profile.valid_until and profile.valid_until < timezone.localdate():
            return Response(
                {
                    "detail": "Your student membership validity has expired.",
                    "code": "membership_expired",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        subclub_ids = request.data.get("subclub_ids", [])
        subclubs = SubClub.objects.filter(
            id__in=subclub_ids, club=profile.club, is_active=True
        )
        profile.sub_clubs.set(subclubs)
        _compute_gamification(profile, actor)
        return Response(
            {
                "message": "Sub-clubs updated successfully.",
                "sub_clubs": [{"id": sc.id, "name": sc.name} for sc in subclubs],
                "points": profile.points,
            }
        )


class StudentMemberMePasswordView(APIView):
    """POST /api/v1/members/me/change-password/ -- In-app password change."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        current_password = str(request.data.get("current_password", "")).strip()
        new_password = str(request.data.get("new_password", "")).strip()

        if not current_password or not new_password:
            return Response(
                {
                    "detail": "Current password and new password are required.",
                    "code": "missing_fields",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        profile = getattr(user, "student_profile", None)
        if profile is not None:
            if profile.is_suspended_by_coordinator:
                return Response(
                    {
                        "detail": (
                            "Your account is temporarily suspended by your coordinator."
                        ),
                        "code": "account_suspended",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            if profile.valid_until and profile.valid_until < timezone.localdate():
                return Response(
                    {
                        "detail": "Your student membership validity has expired.",
                        "code": "membership_expired",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        if not user.check_password(current_password):
            return Response(
                {"detail": "Incorrect current password.", "code": "invalid_password"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(new_password) < 8:
            return Response(
                {
                    "detail": "New password must be at least 8 characters long.",
                    "code": "weak_password",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"message": "Password updated successfully.", "success": True})
