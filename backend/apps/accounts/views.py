"""HTTP views for the Accounts app — D1 auth surface (BRIEF_M4 §3 D1).

This is the **first login surface in the system** (M3-A2 deliberately deferred
auth UI to M4). It exposes the M1 identity flows over HTTP; it does not add
auth primitives.

Discipline (P0/P4/I5):

* **No new primitives.** Email OTP = M1 ``send_email_otp``/``verify_email_otp``;
  password login = M1 ``club_login``; password change = M1 ``change_password``.
  No social login, no reset redesign, no new hashing (U4 pin stands).
* **One gate.** Category + account-state enforcement lives in
  ``services._require_club_login_eligible`` — shared by the password and OTP
  paths so they cannot drift (I5: enforcement, never UI hiding).
* **Enumeration-safe.** The OTP request endpoint answers identically whether or
  not the address exists — it can never be used to probe for accounts.
* **Rate-limited per IP** on every credential-taking endpoint (sliding window).
* ``must_change_password`` is respected: those sessions are allowed to reach
  exactly one place, the change-password endpoint (``CategoryGate(
  require_fresh_password=False)``).
"""
from __future__ import annotations

from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from . import captcha, services
from .policies import CategoryGate
from .throttles import client_ip, sliding_window_allow

#: Per-IP-per-minute ceilings for the credential-taking endpoints (P0).
OTP_REQUEST_LIMIT = 6
OTP_VERIFY_LIMIT = 10
PASSWORD_LOGIN_LIMIT = 10
PASSWORD_CHANGE_LIMIT = 6

#: Fixed response body for OTP request — same bytes for known and unknown
#: addresses (enumeration safety).
OTP_REQUEST_ACCEPTED = {
    "detail": "If that address has an account, a code is on its way."
}


def _throttled(scope: str, limit: int, request: Request) -> Response | None:
    """429 when the per-IP sliding window is full (P0)."""
    key = f"auth:{scope}:{client_ip(request)}"
    if not sliding_window_allow(key, limit, 60):
        return Response(
            {"detail": "Too many attempts. Try again in a minute."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    return None


def _session_payload(user) -> dict[str, object]:
    """Session/user summary for the UI — derived once, never recounted."""
    return {
        "username": user.get_username(),
        "email": user.email,
        "category": getattr(user, "category", ""),
        "sub_role": getattr(user, "sub_role", ""),
        "account_state": getattr(user, "account_state", ""),
        "must_change_password": bool(getattr(user, "must_change_password", False)),
        "institution_code": getattr(user, "institution_code", ""),
        "club_code": getattr(user, "club_code", ""),
    }


class OtpRequestView(APIView):
    """``POST /api/v1/accounts/otp/request/`` — send a login code to an email."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request: Request) -> Response:
        blocked = _throttled("otp_request", OTP_REQUEST_LIMIT, request)
        if blocked is not None:
            return blocked
        email = str(request.data.get("email", "")).strip()
        if email:
            try:
                services.send_email_otp(
                    email=email,
                    purpose=services.OTP_PURPOSE_LOGIN,
                    request=request,
                )
            except Exception:
                # Never disclose whether the address exists (enumeration).
                pass
        return Response(OTP_REQUEST_ACCEPTED, status=status.HTTP_202_ACCEPTED)


class OtpVerifyView(APIView):
    """``POST /api/v1/accounts/otp/verify/`` — consume a code and open a session."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request: Request) -> Response:
        blocked = _throttled("otp_verify", OTP_VERIFY_LIMIT, request)
        if blocked is not None:
            return blocked
        user = services.login_with_otp(
            email=str(request.data.get("email", "")).strip(),
            code=str(request.data.get("code", "")).strip(),
            request=request,
        )
        auth_login(request, user)
        return Response(_session_payload(user))


class CaptchaView(APIView):
    """``GET /api/v1/accounts/captcha/`` — mint the office-login captcha.

    Renders an SVG straight from the server (stdlib only, no image deps) and
    holds the answer ONLY in the session — one-shot, 10-minute TTL
    (apps/accounts/captcha.py). ``Cache-Control: no-store`` plus the client's
    ``?t=`` nonce keep every refresh fresh.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request: Request) -> HttpResponse:
        return HttpResponse(
            captcha.issue_captcha(request),
            content_type="image/svg+xml",
            headers={"Cache-Control": "no-store, max-age=0"},
        )


class PasswordLoginView(APIView):
    """``POST /api/v1/accounts/login/`` — employee code + password + captcha.

    The office login gate (owner 2026-10-27, previous-project pattern): no
    email delivery anywhere on this door — it must work with NO mail server.
    ``services.password_login`` owns the gate rules (P4 single source).
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request: Request) -> Response:
        blocked = _throttled("password_login", PASSWORD_LOGIN_LIMIT, request)
        if blocked is not None:
            return blocked
        user = services.password_login(
            username=str(request.data.get("username", "")).strip(),
            password=str(request.data.get("password", "")),
            captcha=str(request.data.get("captcha", "")).strip(),
            request=request,
        )
        auth_login(request, user)
        return Response(_session_payload(user))


class LogoutView(APIView):
    """``POST /api/v1/accounts/logout/`` — end the session."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        auth_logout(request)
        return Response({"detail": "Signed out."})


class MeView(APIView):
    """``GET /api/v1/accounts/me/`` — the current session's account summary."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        return Response(_session_payload(request.user))


class ChangePasswordView(APIView):
    """``POST /api/v1/accounts/password/change/`` — set the permanent password.

    Reachable by sessions still under ``must_change_password`` (the F5
    temporary-password / F2 welcome-link state) — that is the one place they
    are allowed to go.
    """

    permission_classes = [
        IsAuthenticated,
        CategoryGate("club", require_fresh_password=False),
    ]

    def post(self, request: Request) -> Response:
        blocked = _throttled("password_change", PASSWORD_CHANGE_LIMIT, request)
        if blocked is not None:
            return blocked
        services.change_password(
            user=request.user,
            current_password=str(request.data.get("current_password", "")),
            new_password=str(request.data.get("new_password", "")),
        )
        return Response(_session_payload(request.user))
