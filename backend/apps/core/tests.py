"""Repository smoke tests (milestone M0).

These run with the dev settings and zero external dependencies: Django test
client requests against the health probes and the OpenAPI schema endpoint.
Run with ``pytest`` (from backend/) or ``python manage.py test apps.core``.
"""

from django.test import TestCase

from apps.accounts.models import Category, SubRole
from tests.support import make_user


class HealthEndpointSmokeTests(TestCase):
    def test_liveness_returns_ok(self) -> None:
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_readiness_returns_ok_when_backing_services_available(self) -> None:
        response = self.client.get("/health/ready/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "ready")
        self.assertTrue(payload["checks"]["database"])
        self.assertTrue(payload["checks"]["cache"])

    def test_liveness_rejects_non_get(self) -> None:
        response = self.client.post("/health/")
        self.assertEqual(response.status_code, 405)


class OpenApiSchemaSmokeTests(TestCase):
    def _gated_session(self) -> None:
        """L2 (2026-11-08): schema/docs moved behind CategoryGate("admin")."""
        user = make_user(
            username="smokeadmin01",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        self.client.force_login(user)
        session = self.client.session
        session["mfa_verified"] = True
        session.save()
    def test_schema_endpoint_returns_openapi_document(self) -> None:
        self._gated_session()
        response = self.client.get("/api/schema/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"openapi", response.content)

    def test_schema_endpoint_supports_json_format(self) -> None:
        self._gated_session()
        response = self.client.get("/api/schema/", {"format": "json"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("openapi", payload)
        self.assertIn("paths", payload)

    def test_swagger_docs_page_is_served(self) -> None:
        self._gated_session()
        response = self.client.get("/api/docs/")
        self.assertEqual(response.status_code, 200)
