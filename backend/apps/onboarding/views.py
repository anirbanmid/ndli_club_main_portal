"""Onboarding views (BRIEF_M4 §3 D2) — thin adapters over ``services``.

Every endpoint is token-gated by the resume capability (X-Onboarding-Token);
no session or user is involved at this stage (the authorities have no
accounts yet — they are OTP-validated in place, W1/W2). Per-IP sliding
windows guard every credential-taking endpoint (P0).
"""
from __future__ import annotations

from django.http import FileResponse
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.throttles import client_ip, sliding_window_allow

from . import services
from .models import OnboardingAuthority, OnboardingDraft
from .services import OnboardingError

#: Per-IP-per-minute ceilings (P0).
CREATE_LIMIT = 6
RESUME_LIMIT = 12
OTP_SEND_LIMIT = 6
OTP_VERIFY_LIMIT = 10
UPLOAD_LIMIT = 6
SUBMIT_LIMIT = 6

TOKEN_HEADER = "HTTP_X_ONBOARDING_TOKEN"


def _throttled(scope: str, limit: int, request: Request) -> Response | None:
    """429 when the per-IP sliding window is full (P0)."""
    key = f"onboarding:{scope}:{client_ip(request)}"
    if not sliding_window_allow(key, limit, 60):
        return Response(
            {
                "detail": "Too many attempts. Try again in a minute.",
                "code": "throttled",
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    return None


def _error(exc: OnboardingError) -> Response:
    return Response(
        {"detail": exc.message, "code": exc.code}, status=exc.http_status
    )


def _token(request: Request) -> str:
    return str(request.headers.get("X-Onboarding-Token", "")).strip()


def _draft_or_error(request: Request) -> OnboardingDraft | Response:
    try:
        return services.get_draft_by_token(_token(request))
    except OnboardingError as exc:
        return _error(exc)


def _authority_or_error(
    draft: OnboardingDraft, role: str
) -> OnboardingAuthority | Response:
    authority = OnboardingAuthority.objects.filter(draft=draft, role=role).first()
    if authority is None:
        return Response(
            {"detail": "Authority step not found.", "code": "unknown_role"},
            status=status.HTTP_404_NOT_FOUND,
        )
    return authority


def _draft_payload(draft: OnboardingDraft) -> dict[str, object]:
    """Wizard state for the UI — derived once, never recounted."""
    authorities = {
        a.role: {
            "full_name": a.full_name,
            "email": a.email,
            "phone": a.phone,
            "designation": a.designation,
            "otp_verified": a.otp_verified_at is not None,
        }
        for a in draft.authorities.all()
    }
    return {
        "id": str(draft.id),
        "institution_name": draft.institution_name,
        "aishe_code": draft.aishe_code,
        "club_name": draft.club_name,
        "zone_code": draft.zone_code,
        "state_code": draft.state_code,
        "district_code": draft.district_code,
        "status": draft.status,
        "authorities": authorities,
        "document_uploaded": hasattr(draft, "upload"),
    }


class DraftCreateView(APIView):
    """``POST /api/v1/onboarding/drafts/`` — start the wizard."""

    permission_classes: list = []
    authentication_classes: list = []
    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        blocked = _throttled("create", CREATE_LIMIT, request)
        if blocked is not None:
            return blocked
        data = request.data
        try:
            draft, raw_token = services.create_draft(
                institution_name=str(data.get("institution_name", "")),
                aishe_code=str(data.get("aishe_code", "")),
                club_name=str(data.get("club_name", "")),
                zone_code=str(data.get("zone_code", "")),
                state_code=str(data.get("state_code", "")),
                district_code=str(data.get("district_code", "")),
            )
        except OnboardingError as exc:
            return _error(exc)
        return Response(
            {**_draft_payload(draft), "resume_token": raw_token},
            status=status.HTTP_201_CREATED,
        )


class DraftResumeView(APIView):
    """``POST /api/v1/onboarding/drafts/resume/`` — W1 resume (expiry refused)."""

    permission_classes: list = []
    authentication_classes: list = []
    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        blocked = _throttled("resume", RESUME_LIMIT, request)
        if blocked is not None:
            return blocked
        raw_token = str(request.data.get("token", "")).strip()
        try:
            draft = services.get_draft_by_token(raw_token)
        except OnboardingError as exc:
            return _error(exc)
        return Response(_draft_payload(draft))


class IdentityView(APIView):
    """``POST /api/v1/onboarding/drafts/<id>/identity/`` — identity step."""

    permission_classes: list = []
    authentication_classes: list = []
    parser_classes = [JSONParser]

    def post(self, request: Request, draft_id: str) -> Response:
        draft = _draft_or_error(request)
        if isinstance(draft, Response):
            return draft
        if str(draft.id) != draft_id:
            return Response(
                {"detail": "Draft not found.", "code": "draft_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            services.update_identity(draft, **dict(request.data))
        except OnboardingError as exc:
            return _error(exc)
        return Response(_draft_payload(draft))


class AuthorityUpsertView(APIView):
    """``POST .../authorities/<role>/`` — save one authority slot."""

    permission_classes: list = []
    authentication_classes: list = []
    parser_classes = [JSONParser]

    def post(self, request: Request, draft_id: str, role: str) -> Response:
        draft = _draft_or_error(request)
        if isinstance(draft, Response):
            return draft
        if str(draft.id) != draft_id:
            return Response(
                {"detail": "Draft not found.", "code": "draft_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            services.upsert_authority(draft, role, **dict(request.data))
        except OnboardingError as exc:
            return _error(exc)
        return Response(_draft_payload(draft))


class AuthorityOtpSendView(APIView):
    """``POST .../authorities/<role>/otp/send/`` — W2 (enumeration-safe)."""

    permission_classes: list = []
    authentication_classes: list = []
    parser_classes = [JSONParser]

    def post(self, request: Request, draft_id: str, role: str) -> Response:
        blocked = _throttled("otp_send", OTP_SEND_LIMIT, request)
        if blocked is not None:
            return blocked
        draft = _draft_or_error(request)
        if isinstance(draft, Response):
            return draft
        if str(draft.id) != draft_id:
            return Response(
                {"detail": "Draft not found.", "code": "draft_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        authority = _authority_or_error(draft, role)
        if isinstance(authority, Response):
            return authority
        try:
            services.send_authority_otp(authority, request=request)
        except Exception:
            # Identical 202 whether or not the address is deliverable (W2:
            # enumeration safety — same contract as D1's OTP request).
            pass
        return Response(
            {"detail": "If that address is reachable, a code is on its way."}
        )


class AuthorityOtpVerifyView(APIView):
    """``POST .../authorities/<role>/otp/verify/`` — pass the step (W1/W2)."""

    permission_classes: list = []
    authentication_classes: list = []
    parser_classes = [JSONParser]

    def post(self, request: Request, draft_id: str, role: str) -> Response:
        blocked = _throttled("otp_verify", OTP_VERIFY_LIMIT, request)
        if blocked is not None:
            return blocked
        draft = _draft_or_error(request)
        if isinstance(draft, Response):
            return draft
        if str(draft.id) != draft_id:
            return Response(
                {"detail": "Draft not found.", "code": "draft_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        authority = _authority_or_error(draft, role)
        if isinstance(authority, Response):
            return authority
        try:
            services.verify_authority_otp(
                authority, str(request.data.get("code", "")).strip(), request=request
            )
        except OnboardingError as exc:
            return _error(exc)
        except Exception:
            return Response(
                {"detail": "That code is not valid.", "code": "bad_code"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(_draft_payload(draft))


class UploadView(APIView):
    """``POST /api/v1/onboarding/drafts/<id>/upload/`` — the combined doc (W3)."""

    permission_classes: list = []
    authentication_classes: list = []
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request, draft_id: str) -> Response:
        blocked = _throttled("upload", UPLOAD_LIMIT, request)
        if blocked is not None:
            return blocked
        draft = _draft_or_error(request)
        if isinstance(draft, Response):
            return draft
        if str(draft.id) != draft_id:
            return Response(
                {"detail": "Draft not found.", "code": "draft_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        uploaded = request.FILES.get("document")
        if uploaded is None:
            return Response(
                {"detail": "No document supplied.", "code": "missing_file"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            services.store_combined_document(draft, uploaded)
        except OnboardingError as exc:
            return _error(exc)
        return Response(_draft_payload(draft))


class DocumentDownloadView(APIView):
    """``GET .../upload/`` — W3: attachment only, never inline."""

    permission_classes: list = []
    authentication_classes: list = []

    def get(self, request: Request, draft_id: str) -> Response:
        draft = _draft_or_error(request)
        if isinstance(draft, Response):
            return draft
        if str(draft.id) != draft_id:
            return Response(
                {"detail": "Draft not found.", "code": "draft_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        upload = getattr(draft, "upload", None)
        if upload is None:
            return Response(
                {"detail": "No document stored.", "code": "no_document"},
                status=status.HTTP_404_NOT_FOUND,
            )
        from .services import _upload_root

        path = _upload_root() / upload.stored_name[:2] / upload.stored_name
        response = FileResponse(
            open(path, "rb"), content_type="application/octet-stream"
        )
        response["Content-Disposition"] = f'attachment; filename="{upload.stored_name}"'
        response["X-Content-Type-Options"] = "nosniff"
        return response  # type: ignore[return-value]


class SubmitView(APIView):
    """``POST .../submit/`` — W1 gate + charter queue (M4 stops at enqueue)."""

    permission_classes: list = []
    authentication_classes: list = []
    parser_classes = [JSONParser]

    def post(self, request: Request, draft_id: str) -> Response:
        blocked = _throttled("submit", SUBMIT_LIMIT, request)
        if blocked is not None:
            return blocked
        draft = _draft_or_error(request)
        if isinstance(draft, Response):
            return draft
        if str(draft.id) != draft_id:
            return Response(
                {"detail": "Draft not found.", "code": "draft_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            application = services.submit_draft(draft, request=request)
        except OnboardingError as exc:
            return _error(exc)
        return Response(
            {"application_id": str(application.id), "status": application.status},
            status=status.HTTP_201_CREATED,
        )
