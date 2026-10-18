"""Cross-cutting security middleware (BRIEF_M1.md §6).

``SecurityHeadersMiddleware`` stamps the full security-header policy on
EVERY response — including 4xx/5xx error responses — and assigns the
per-request audit correlation id (header ``X-Request-ID``, never a URL).
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.http import HttpRequest, HttpResponse

#: Documented in docs/SECURITY.md ("Header policy"). ``style-src`` keeps
#: 'unsafe-inline' until the M10 tightening pass (BRIEF_M1.md §6).
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)

PERMISSIONS_POLICY = (
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
    "microphone=(), payment=(), usb=()"
)


class SecurityHeadersMiddleware:
    """Attach the security-header policy and the audit request id."""

    def __init__(self, get_response: object) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        request_id = uuid.uuid4().hex
        setattr(request, "audit_request_id", request_id)  # noqa: B010 - runtime attr
        response = self.get_response(request)  # type: ignore[operator]
        response.setdefault("X-Request-ID", request_id)
        response.setdefault("Strict-Transport-Security",
                            "max-age=31536000; includeSubDomains; preload")
        response.setdefault("X-Content-Type-Options", "nosniff")
        response.setdefault("X-Frame-Options", "DENY")
        response.setdefault("Referrer-Policy", "no-referrer")
        response.setdefault("Permissions-Policy", PERMISSIONS_POLICY)
        response.setdefault(
            "Content-Security-Policy",
            getattr(settings, "CONTENT_SECURITY_POLICY", CONTENT_SECURITY_POLICY),
        )
        return response
