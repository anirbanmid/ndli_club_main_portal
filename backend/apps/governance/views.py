"""HTTP views for the Governance app — M6 charter desk API (D2c).

Thin adapters over ``governance.services`` (the rules live there). Discipline
(P0/P4):

* Authorization decisions live ONLY in ``accounts.policies``:
  ``CategoryGate("admin", DECIDER_SUB_ROLES)`` at the door, and the
  service-level queryset scoping (``services.queue_for``) already makes
  out-of-zone rows indistinguishable from missing ones — 404, never data.
* Views never branch on who the caller is (T3 greps for that).
* Upload bytes are served ONLY through the scoped endpoint below (never
  public URLs); the decision endpoint reads exactly two fields from the body
  — no mass-assignment of status/sanction fields, ever.
"""

from __future__ import annotations

from typing import Any

from django.http import FileResponse
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.policies import CategoryGate
from apps.onboarding.models import OnboardingAuthority, OnboardingUpload
from apps.onboarding.services import _upload_root

from .services import (
    DECIDER_SUB_ROLES,
    GovernanceError,
    queue_for,
    review_charter,
)

#: The one door to the charter desk (admin module, decider sub-roles only).
CHARTER_GATE = CategoryGate("admin", DECIDER_SUB_ROLES)

_PAGE_SIZE = 20

_ERROR_STATUS = {
    "not_found": status.HTTP_404_NOT_FOUND,
    "not_a_decider": status.HTTP_403_FORBIDDEN,
}


def _error(exc: GovernanceError) -> Response:
    code = str(exc)
    return Response(
        {"error": code},
        status=_ERROR_STATUS.get(code, status.HTTP_400_BAD_REQUEST),
    )


def _row_payload(application: Any) -> dict[str, Any]:
    return {
        "id": str(application.pk),
        "institution_name": application.institution_name,
        "club_name": application.club_name,
        "zone_code": application.zone_code,
        "state_code": application.state_code,
        "district_code": application.district_code,
        "status": application.status,
        "submitted_at": application.submitted_at,
        "reviewed_at": application.reviewed_at,
        "review_reason": application.review_reason,
    }


def _scoped_row(request: Request, pk: Any) -> tuple[Any, Response | None]:
    """Fetch one charter row inside the caller's scope (404 semantics)."""
    try:
        application = queue_for(request.user).filter(pk=pk).first()
    except GovernanceError as exc:
        return None, _error(exc)
    if application is None:
        return None, _error(GovernanceError("not_found"))
    return application, None


class CharterQueueView(APIView):
    """``GET /admin/api/v1/governance/charter/queue/`` — the caller's review queue."""

    permission_classes = [IsAuthenticated, CHARTER_GATE]

    def get(self, request: Request) -> Response:
        try:
            qs = queue_for(request.user)
        except GovernanceError as exc:
            return _error(exc)
        paginator = PageNumberPagination()
        paginator.page_size = _PAGE_SIZE
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response([_row_payload(a) for a in page or []])


class CharterDetailView(APIView):
    """``GET /admin/api/v1/governance/charter/<pk>/`` — row + authorities + uploads.

    Uploads are METADATA ONLY (no content, no URLs): the bytes live behind the
    scoped ``CharterUploadView`` endpoint exclusively (P0).
    """

    permission_classes = [IsAuthenticated, CHARTER_GATE]

    def get(self, request: Request, pk: Any) -> Response:
        application, error = _scoped_row(request, pk)
        if error is not None:
            return error
        payload = _row_payload(application)
        payload["authorities"] = [
            {
                "role": a.role,
                "full_name": a.full_name,
                "email": a.email,
                "phone": a.phone,
                "designation": a.designation,
                "otp_verified": a.otp_verified_at is not None,
            }
            for a in OnboardingAuthority.objects.filter(draft=application.draft)
        ]
        payload["uploads"] = [
            {
                "id": str(u.pk),
                "original_name": u.original_name,
                "mime_type": u.mime_type,
                "size_bytes": u.size_bytes,
                "uploaded_at": u.uploaded_at,
            }
            for u in OnboardingUpload.objects.filter(draft=application.draft)
        ]
        return Response(payload)


class CharterUploadView(APIView):
    """``GET .../uploads/<upload_id>/`` — the ONLY way upload bytes move (P0)."""

    permission_classes = [IsAuthenticated, CHARTER_GATE]

    def get(self, request: Request, pk: Any, upload_id: Any) -> Any:
        application, error = _scoped_row(request, pk)
        if error is not None:
            return error
        upload = OnboardingUpload.objects.filter(
            pk=upload_id, draft=application.draft
        ).first()
        if upload is None:
            return _error(GovernanceError("not_found"))
        path = _upload_root() / upload.stored_name[:2] / upload.stored_name
        if not path.is_file():
            return _error(GovernanceError("not_found"))
        response = FileResponse(
            path.open("rb"), content_type=upload.mime_type or "application/octet-stream"
        )
        response["Content-Disposition"] = f'attachment; filename="{upload.stored_name}"'
        return response


class CharterDecisionView(APIView):
    """``POST .../decision/`` — record a review/sanction/reject decision.

    The body is read for EXACTLY TWO fields (``decision``, ``reason``) — no
    mass-assignment of status/sanction fields is possible (P0).
    """

    permission_classes = [IsAuthenticated, CHARTER_GATE]

    def post(self, request: Request, pk: Any) -> Response:
        try:
            application = review_charter(
                application_id=pk,
                user=request.user,
                decision=str(request.data.get("decision", "")),
                reason=str(request.data.get("reason", "")),
                request=request,
            )
        except GovernanceError as exc:
            return _error(exc)
        return Response(_row_payload(application))
