"""T6 — the security-header baseline (BRIEF_M1.md §6 / §7 T6).

Pinned: the full header policy lands on EVERY response, including 4xx/5xx
error responses, and CSP is enforced (no ``unsafe-inline`` in ``script-src``).
"""
from __future__ import annotations

from django.http import HttpResponse
from django.test import RequestFactory

from apps.core.middleware import SecurityHeadersMiddleware

from .support import M1PinTestCase as TestCase

#: The headers the baseline promises (docs/SECURITY.md "Header policy").
REQUIRED_HEADERS = (
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Content-Security-Policy",
)

PROBE_PATHS = (
    "/health/",
    "/health/ready/",
    "/api/schema/",
    "/api/docs/",
    "/does-not-exist/",
)


class SecurityHeaderTests(TestCase):
    def test_every_response_carries_the_header_policy(self) -> None:
        for path in PROBE_PATHS:
            response = self.client.get(path, SERVER_NAME="localhost")
            with self.subTest(path=path, status=response.status_code):
                for header in REQUIRED_HEADERS:
                    self.assertTrue(
                        response.has_header(header),
                        f"{header} missing on {path} ({response.status_code})",
                    )

    def test_error_responses_are_covered_too(self) -> None:
        """4xx/5xx must not be a header blind spot."""
        for path in ("/does-not-exist/", "/health/"):
            response = self.client.get(path, SERVER_NAME="localhost")
            with self.subTest(path=path, status=response.status_code):
                self.assertIn("Content-Security-Policy", response.headers)
                self.assertIn("X-Content-Type-Options", response.headers)

    def test_nosniff_and_frame_deny_are_pinned_values(self) -> None:
        response = self.client.get("/health/", SERVER_NAME="localhost")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response["X-Frame-Options"], "DENY")
        self.assertEqual(response["Referrer-Policy"], "no-referrer")

    def test_hsts_is_a_long_max_age(self) -> None:
        response = self.client.get("/health/", SERVER_NAME="localhost")
        self.assertIn("max-age=31536000", response["Strict-Transport-Security"])
        self.assertIn("includeSubDomains", response["Strict-Transport-Security"])

    def test_csp_has_no_unsafe_inline_script(self) -> None:
        response = self.client.get("/health/", SERVER_NAME="localhost")
        csp = response["Content-Security-Policy"]
        script_src = next(
            (
                part.strip()
                for part in csp.split(";")
                if part.strip().startswith("script-src")
            ),
            "",
        )
        self.assertIn("'self'", script_src)
        self.assertNotIn("unsafe-inline", script_src)
        self.assertNotIn("unsafe-eval", script_src)

    def test_csp_blocks_framing_and_enforces_base_and_form(self) -> None:
        response = self.client.get("/health/", SERVER_NAME="localhost")
        csp = response["Content-Security-Policy"]
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertIn("base-uri 'self'", csp)
        self.assertIn("form-action 'self'", csp)

    def test_permissions_policy_disables_the_dangerous_sensors(self) -> None:
        response = self.client.get("/health/", SERVER_NAME="localhost")
        policy = response["Permissions-Policy"]
        for feature in ("camera", "microphone", "geolocation", "payment"):
            self.assertIn(f"{feature}=()", policy)

    def test_each_response_gets_its_own_request_id(self) -> None:
        first = self.client.get("/health/", SERVER_NAME="localhost")
        second = self.client.get("/health/", SERVER_NAME="localhost")
        self.assertTrue(first["X-Request-ID"])
        self.assertTrue(second["X-Request-ID"])
        self.assertNotEqual(first["X-Request-ID"], second["X-Request-ID"])

    def test_request_id_is_not_accepted_from_the_client(self) -> None:
        """The correlation id is server-generated, never client-controlled."""
        response = self.client.get(
            "/health/",
            SERVER_NAME="localhost",
            HTTP_X_REQUEST_ID="attacker-chosen",
        )
        self.assertNotEqual(response["X-Request-ID"], "attacker-chosen")


class MiddlewareUnitTests(TestCase):
    def test_middleware_stamps_an_unprepared_response(self) -> None:
        def get_response(request):  # noqa: ANN001
            return HttpResponse("ok")

        middleware = SecurityHeadersMiddleware(get_response)
        response = middleware(RequestFactory().get("/"))
        for header in REQUIRED_HEADERS:
            self.assertTrue(response.has_header(header), header)

    def test_middleware_does_not_clobber_an_explicit_header(self) -> None:
        def get_response(request):  # noqa: ANN001
            response = HttpResponse("ok")
            response["X-Frame-Options"] = "SAMEORIGIN"
            return response

        middleware = SecurityHeadersMiddleware(get_response)
        response = middleware(RequestFactory().get("/"))
        self.assertEqual(response["X-Frame-Options"], "SAMEORIGIN")
