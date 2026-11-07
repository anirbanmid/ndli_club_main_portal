"""HTTP views for the Sharing app (3-Tier Curated NDLI Libraries).

Strict content law: Only links from the official NDLI site (ndli.iitkgp.ac.in)
are allowed.
"""

from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.core.scoping import authenticated_user
from apps.domain.models import Club
from apps.sharing.models import (
    CuratedLibrary,
    CuratedResourceLink,
    LibraryType,
    validate_ndli_url,
)


class LibraryListView(APIView):
    """List or create curated libraries (Club, Personal, Community)."""

    parser_classes = [JSONParser]

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request: Request) -> Response:
        club_code = str(
            request.query_params.get("club_code")
            or request.query_params.get("club_id")
            or ""
        ).strip()
        lib_type = str(request.query_params.get("type", "")).strip()

        qs = CuratedLibrary.objects.select_related("club", "owner", "sub_club")

        if club_code:
            qs = qs.filter(club__code__iexact=club_code)

        from apps.core.scoping import authenticated_user

        user = authenticated_user(request)
        if not user and not club_code:
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if lib_type == "club":
            qs = qs.filter(library_type=LibraryType.CLUB)
        elif lib_type == "personal":
            if user:
                qs = qs.filter(library_type=LibraryType.PERSONAL, owner=user)
            else:
                qs = qs.filter(
                    library_type=LibraryType.PERSONAL,
                    is_published_to_community=True,
                )
        elif lib_type == "community":
            qs = qs.filter(is_published_to_community=True)
        elif lib_type:
            if not user:
                qs = qs.filter(is_published_to_community=True)
            qs = qs.filter(library_type=lib_type)

        results = [
            {
                "id": lib.id,
                "club_code": lib.club.code,
                "library_type": lib.library_type,
                "title": lib.title,
                "topic_category": lib.topic_category,
                "owner_name": lib.owner.username,
                "sub_club": {"id": lib.sub_club.id, "name": lib.sub_club.name}
                if lib.sub_club
                else None,
                "is_published_to_community": lib.is_published_to_community,
                "resources_count": lib.resources.count(),
                "created_at": lib.created_at,
                "updated_at": lib.updated_at,
            }
            for lib in qs.order_by("-updated_at")
        ]
        return Response({"libraries": results, "count": len(results)})

    def post(self, request: Request) -> Response:
        data = request.data
        club_code = str(data.get("club_code", "")).strip()
        lib_type = str(data.get("library_type", "club")).strip()
        title = str(data.get("title", "")).strip()
        topic_category = str(data.get("topic_category", "General")).strip()
        sub_club_id = data.get("sub_club_id")

        from apps.core.scoping import authenticated_user

        user = authenticated_user(request)

        if not club_code and user:
            profile = getattr(user, "student_profile", None)
            if profile and profile.club:
                club_code = profile.club.code
            elif hasattr(user, "club") and user.club:
                club_code = user.club.code
            elif hasattr(user, "memberships") and user.memberships.exists():
                first_m = user.memberships.first()
                if first_m:
                    club_code = first_m.club.code

        if not club_code or not title:
            return Response(
                {
                    "detail": "club_code and title are required.",
                    "code": "missing_params",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        club = Club.objects.filter(code__iexact=club_code).first()
        if not club:
            return Response(
                {"detail": "Club not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not user:
            user = (
                User.objects.filter(authority_assignments__club=club).first()
                or User.objects.first()
            )

        if not isinstance(user, User):
            return Response(
                {"detail": "Authenticated user required to create a library space."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        sub_club = None
        if sub_club_id:
            from apps.domain.models import SubClub

            sub_club = SubClub.objects.filter(id=sub_club_id, club=club).first()

        library = CuratedLibrary.objects.create(
            club=club,
            library_type=lib_type,
            title=title,
            topic_category=topic_category,
            owner=user,
            sub_club=sub_club,
            is_published_to_community=(lib_type == LibraryType.COMMUNITY),
        )
        return Response(
            {
                "id": library.id,
                "title": library.title,
                "library_type": library.library_type,
                "topic_category": library.topic_category,
                "message": "Library space created successfully.",
            },
            status=status.HTTP_201_CREATED,
        )


class LibraryDetailView(APIView):
    """Inspect, edit, publish to community, or delete a library."""

    parser_classes = [JSONParser]

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request: Request, pk: int) -> Response:
        lib = (
            CuratedLibrary.objects.select_related("club", "owner", "sub_club")
            .filter(pk=pk)
            .first()
        )
        if not lib:
            return Response(
                {"detail": "Library not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # H7: anonymous/unpublished library read — only allow for owner or
        # published-to-community libraries
        if not lib.is_published_to_community and lib.owner != authenticated_user(request):
            from apps.members.views import _is_main_club_authority

            if not _is_main_club_authority(authenticated_user(request), lib.club):
                return Response(
                    {"detail": "Library not found.", "code": "not_found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

        resources = [
            {
                "id": r.id,
                "title": r.title,
                "ndli_url": r.ndli_url,
                "topic_path": r.topic_path,
                "description": r.description,
                "added_at": r.added_at,
            }
            for r in lib.resources.all()
        ]

        # Group resources by topic subdirectory path
        topics: dict[str, list[dict[str, Any]]] = {}
        for r in resources:
            path = str(r["topic_path"] or "Root")
            topics.setdefault(path, []).append(r)

        return Response(
            {
                "id": lib.id,
                "club_code": lib.club.code,
                "library_type": lib.library_type,
                "title": lib.title,
                "topic_category": lib.topic_category,
                "owner_name": lib.owner.username,
                "is_published_to_community": lib.is_published_to_community,
                "resources": resources,
                "topics": topics,
                "created_at": lib.created_at,
            }
        )

    def patch(self, request: Request, pk: int) -> Response:
        lib = CuratedLibrary.objects.filter(pk=pk).first()
        if not lib:
            return Response(
                {"detail": "Library not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # H7: owner check — only library owner or club authority can edit
        if lib.owner != authenticated_user(request):
            from apps.members.views import _is_main_club_authority

            if not _is_main_club_authority(authenticated_user(request), lib.club):
                return Response(
                    {"detail": "Permission denied.", "code": "forbidden"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        data = request.data
        if "title" in data:
            lib.title = str(data["title"]).strip()
        if "topic_category" in data:
            lib.topic_category = str(data["topic_category"]).strip()
        if "is_published_to_community" in data:
            lib.is_published_to_community = bool(data["is_published_to_community"])

        lib.save()
        return Response(
            {
                "id": lib.id,
                "title": lib.title,
                "is_published_to_community": lib.is_published_to_community,
                "message": "Library updated successfully.",
            }
        )

    def delete(self, request: Request, pk: int) -> Response:
        lib = CuratedLibrary.objects.filter(pk=pk).first()
        if not lib:
            return Response(
                {"detail": "Library not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # H7: owner check — only library owner or club authority can delete
        if lib.owner != authenticated_user(request):
            from apps.members.views import _is_main_club_authority

            if not _is_main_club_authority(authenticated_user(request), lib.club):
                return Response(
                    {"detail": "Permission denied.", "code": "forbidden"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        lib.delete()
        return Response(
            {"message": "Library deleted successfully."}, status=status.HTTP_200_OK
        )


class ResourceLinkCreateView(APIView):
    """Add an NDLI link to a curated library (strict ndli.iitkgp.ac.in rule)."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request: Request, library_id: int) -> Response:
        lib = CuratedLibrary.objects.filter(pk=library_id).first()
        if not lib:
            return Response(
                {"detail": "Library not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # H7: owner check — only library owner or club authority can add resources
        if lib.owner != authenticated_user(request):
            from apps.members.views import _is_main_club_authority

            if not _is_main_club_authority(authenticated_user(request), lib.club):
                return Response(
                    {"detail": "Permission denied.", "code": "forbidden"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        data = request.data
        title = str(data.get("title", "")).strip()
        ndli_url = str(data.get("ndli_url", "")).strip()
        topic_path = str(data.get("topic_path", "")).strip()
        description = str(data.get("description", "")).strip()

        if not title or not ndli_url:
            return Response(
                {
                    "detail": "Title and NDLI URL are required.",
                    "code": "missing_fields",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_ndli_url(ndli_url)
        except Exception as exc:
            return Response(
                {"detail": str(exc), "code": "invalid_ndli_url"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resource = CuratedResourceLink.objects.create(
            library=lib,
            title=title,
            ndli_url=ndli_url,
            topic_path=topic_path,
            description=description,
        )
        return Response(
            {
                "id": resource.id,
                "title": resource.title,
                "ndli_url": resource.ndli_url,
                "topic_path": resource.topic_path,
                "message": "Resource link added to library successfully.",
            },
            status=status.HTTP_201_CREATED,
        )


class ResourceLinkDeleteView(APIView):
    """Delete a resource link."""

    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, pk: int) -> Response:
        resource = CuratedResourceLink.objects.filter(pk=pk).first()
        if not resource:
            return Response(
                {"detail": "Resource not found.", "code": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # H7: owner check — only library owner or club authority can delete resources
        if resource.library.owner != authenticated_user(request):
            from apps.members.views import _is_main_club_authority

            if not _is_main_club_authority(authenticated_user(request), resource.library.club):
                return Response(
                    {"detail": "Permission denied.", "code": "forbidden"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        resource.delete()
        return Response(
            {"message": "Resource deleted successfully."}, status=status.HTTP_200_OK
        )
