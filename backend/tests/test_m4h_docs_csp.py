"""M4H — API docs page is CSP-clean (blank-page regression guard).

The stock drf-spectacular page loads Swagger UI from cdn.jsdelivr.net with an
inline init script; the P0 ``Content-Security-Policy`` (``script-src 'self'``)
blocks both, so ``/api/docs/`` rendered a blank white screen (owner-reported
2026-10-22). The fix vendors swagger-ui-dist 5.34.0 under
``apps/core/static/swagger-ui/`` and moves the init into an external file.
These pins keep the page renderable under the unchanged policy.
"""
from __future__ import annotations

from pathlib import Path

from django.test import TestCase

_SWAGGER_DIR = (
    Path(__file__).resolve().parents[1] / "apps" / "core" / "static" / "swagger-ui"
)


class ApiDocsCspTests(TestCase):
    """``/api/docs/`` must render under ``script-src 'self'``."""

    def test_docs_page_uses_same_origin_assets_only(self) -> None:
        response = self.client.get("/api/docs/")
        self.assertEqual(response.status_code, 200)
        body = response.content.decode()
        self.assertIn('/static/swagger-ui/swagger-ui-bundle.js', body)
        self.assertIn('/static/swagger-ui/swagger-ui-standalone-preset.js', body)
        self.assertIn('/static/swagger-ui/swagger-init.js', body)
        # No third-party origin anywhere on the page (M4H: CDN removed).
        self.assertNotIn("cdn.jsdelivr.net", body)

    def test_docs_page_has_no_inline_script(self) -> None:
        response = self.client.get("/api/docs/")
        body = response.content.decode()
        self.assertEqual(response.status_code, 200)
        for tag in body.split("<script")[1:]:
            head = tag.split(">", 1)[0]
            self.assertIn(
                "src=", head, "inline <script> blocks are blocked by script-src 'self'"
            )

    def test_docs_keeps_the_hardened_csp(self) -> None:
        response = self.client.get("/api/docs/")
        csp = response.headers.get("Content-Security-Policy", "")
        self.assertIn("script-src 'self'", csp)
        self.assertNotIn("unsafe-eval", csp)

    def test_vendored_assets_present_and_init_is_external(self) -> None:
        for name in (
            "swagger-ui-bundle.js",
            "swagger-ui-standalone-preset.js",
            "swagger-ui.css",
            "favicon-32x32.png",
            "swagger-init.js",
        ):
            asset = _SWAGGER_DIR / name
            self.assertTrue(asset.is_file(), f"missing vendored asset {name}")
            self.assertGreater(asset.stat().st_size, 0)
        init = (_SWAGGER_DIR / "swagger-init.js").read_text(encoding="utf8")
        self.assertIn("SwaggerUIBundle(", init)
        self.assertIn("/api/schema/", init)

    def test_schema_still_public(self) -> None:
        response = self.client.get("/api/schema/")
        self.assertEqual(response.status_code, 200)
