"""M3-A6 single-origin serving pins + M3-8 cache correctness.

Pinned here:
  * the three public routes serve their pre-rendered shells (M3-7);
  * fingerprinted assets are immutable; HTML is bounded (V7: never
    stale-forever) and revalidates via ETag/304;
  * the SPA catch-all can never mask the API/admin/health surfaces;
  * path traversal is closed (P0); a missing frontend build fails LOUD (503);
  * GET/HEAD only.
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from django.test import override_settings

from .support import M1PinTestCase as TestCase

SHELL = "<html><body><div id=\"root\">{body}</div></body></html>"


def body_of(response) -> bytes:
    """FileResponse streams; read its payload regardless of response class."""
    if hasattr(response, "streaming_content"):
        return b"".join(response.streaming_content)
    return response.content


def _build_dist() -> Path:
    dist = Path(tempfile.mkdtemp(prefix="m3dist-"))
    (dist / "verify").mkdir()
    (dist / "directory").mkdir()
    (dist / "assets").mkdir()
    (dist / "index.html").write_text(SHELL.format(body="LANDING"), "utf-8")
    (dist / "verify" / "index.html").write_text(SHELL.format(body="VERIFY"), "utf-8")
    (dist / "directory" / "index.html").write_text(
        SHELL.format(body="DIRECTORY"), "utf-8"
    )
    (dist / "assets" / "app-Abc12345.js").write_text("console.log(1)", "utf-8")
    (dist / "favicon.svg").write_text("<svg/>", "utf-8")
    return dist


class SingleOriginServingTests(TestCase):
    dist: Path
    _override: override_settings

    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        cls.dist = _build_dist()
        cls._override = override_settings(FRONTEND_DIST=cls.dist)
        cls._override.enable()

    @classmethod
    def tearDownClass(cls) -> None:
        cls._override.disable()
        shutil.rmtree(cls.dist, ignore_errors=True)
        super().tearDownClass()

    # --- M3-7: the three public routes serve their pre-rendered shells -------

    def test_landing_shell(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"LANDING", body_of(response))

    def test_verify_shell_with_and_without_slash(self) -> None:
        for url in ("/verify/", "/verify", "/verify/?id=NDLI-DEAL-2345"):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, url)
            self.assertIn(b"VERIFY", body_of(response), url)

    def test_directory_shell(self) -> None:
        response = self.client.get("/directory/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"DIRECTORY", body_of(response))

    # --- M3-8 / V7: cache correctness ---------------------------------------

    def test_html_cache_is_bounded_and_etagged(self) -> None:
        response = self.client.get("/")
        cache_control = response["Cache-Control"]
        self.assertIn("max-age=300", cache_control)
        self.assertIn("must-revalidate", cache_control)
        self.assertNotIn("immutable", cache_control)
        self.assertIn("ETag", response)

    def test_etag_revalidation_returns_304(self) -> None:
        first = self.client.get("/")
        second = self.client.get("/", HTTP_IF_NONE_MATCH=first["ETag"])
        self.assertEqual(second.status_code, 304)

    def test_fingerprinted_assets_are_immutable(self) -> None:
        response = self.client.get("/assets/app-Abc12345.js")
        self.assertEqual(response.status_code, 200)
        self.assertIn("immutable", response["Cache-Control"])
        self.assertIn("max-age=31536000", response["Cache-Control"])

    # --- P0: the SPA can never mask API/admin/health ------------------------

    def test_unknown_api_path_is_404_not_html(self) -> None:
        response = self.client.get("/api/v1/nope/")
        self.assertEqual(response.status_code, 404)
        self.assertNotIn(b"LANDING", body_of(response))

    def test_health_surface_not_shadowed(self) -> None:
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(b"LANDING", body_of(response))

    def test_static_surface_is_not_spa(self) -> None:
        response = self.client.get("/static/nope.js")
        self.assertEqual(response.status_code, 404)
        self.assertNotIn(b"LANDING", body_of(response))

    # --- P0: containment + loud failure ------------------------------------

    def test_path_traversal_is_closed(self) -> None:
        for url in (
            "/assets/../../config/settings/base.py",
            "/assets/%2e%2e/%2e%2e/config/settings/base.py",
            "/..%2f..%2fetc/passwd",
        ):
            response = self.client.get(url)
            self.assertNotEqual(response.status_code, 200, url)
            self.assertNotIn(b"SECRET_KEY", body_of(response), url)

    def test_missing_dist_is_a_loud_503(self) -> None:
        with override_settings(FRONTEND_DIST=Path("/nonexistent/dist")):
            response = self.client.get("/")
        self.assertEqual(response.status_code, 503)
        self.assertIn(b"frontend build missing", body_of(response))

    def test_unknown_asset_is_404(self) -> None:
        response = self.client.get("/assets/ghost.js")
        self.assertEqual(response.status_code, 404)

    def test_spa_fallback_for_client_routes(self) -> None:
        response = self.client.get("/some/client/route")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"LANDING", body_of(response))

    # --- Method surface ------------------------------------------------------

    def test_post_is_rejected(self) -> None:
        response = self.client.post("/")
        self.assertEqual(response.status_code, 405)

    def test_head_is_allowed(self) -> None:
        response = self.client.head("/")
        self.assertEqual(response.status_code, 200)
