"""M3 Phase 2 adversarial pins — public API (BRIEF_M3 §5, pins V5-V7).

Named pins (evidence, not claims):

* **V5 search quality** — typo-tolerant hit on a known misspelling (PostgreSQL
  pg_trgm only, M3-A5) · pagination is stable (disjoint pages, no dupes or
  omissions) · filter combinations stay scoped.
* **V6 public scoping** — every M3 endpoint is reachable WITHOUT auth and
  returns NO private field · the failure verdict is byte-identical for
  not-found / bad signature / malformed id (anti-enumeration) · no niche
  surface is mounted under Module 1 routes.
* **V7 cache correctness** — caching headers present and bounded ·
  If-None-Match yields 304 · a content change invalidates (version-checked
  aggregate) · nothing is stale-forever.

Plus the API-level extensions of V2/V3: the verifier response is exactly the
six disclosure fields, and no HMAC key material appears in ANY public
response body.

PostgreSQL-only pins skip on other engines (M3-A5: SQLite is dropped for the
trigram surface, not faked).
"""
from __future__ import annotations

import json

from django.db import connection
from django.test import Client

from apps.accounts.policies import CategoryGate
from apps.certificates import seed as cert_seed
from apps.certificates import services as cert_services
from apps.certificates.models import Certificate
from apps.domain.models import District, Institution, State
from apps.domain.seed import load_samples as load_domain_samples

from .support import M1PinTestCase as TestCase

API = "/api/v1/public"

#: Values that must never appear in ANY public response (V2/V3 sweeps).
FORBIDDEN_KEYS = ("email", "mobile", "phone", "apaar", "legacy_id", "hmac")


class PublicApiBase(TestCase):
    """Shared setup: seeded domain + fixtures + anonymous client."""

    def setUp(self) -> None:
        super().setUp()
        import base64
        import json as _json
        import os
        from unittest import mock

        from apps.certificates import signing

        key_b64 = base64.b64encode(bytes(range(32))).decode()
        env_patch = mock.patch.dict(
            os.environ,
            {
                signing.ENV_KEYRING: _json.dumps({"k2026-a": key_b64}),
                signing.ENV_ACTIVE_KEY_ID: "k2026-a",
            },
        )
        env_patch.start()
        self.addCleanup(env_patch.stop)
        self.key_b64 = key_b64
        self.key_hex = bytes(range(32)).hex()

        load_domain_samples()
        cert_seed.load_certificate_samples()
        self.client = Client()

    def get_json(self, url: str, **params) -> tuple[int, dict]:
        response = self.client.get(url, params)
        return response.status_code, json.loads(response.content or b"{}")

    def get_raw(self, url: str, **params):
        return self.client.get(url, params)

    def assert_no_private_fields(self, body: dict, where: str) -> None:
        dumped = json.dumps(body).lower()
        for forbidden in FORBIDDEN_KEYS:
            self.assertNotIn(forbidden, dumped, f"{where} leaks {forbidden!r}")


class V6PublicScopingPins(PublicApiBase):
    def test_every_endpoint_is_reachable_without_auth(self):
        for url, params in (
            (f"{API}/telemetry/", {}),
            (f"{API}/directory/", {}),
            (f"{API}/verify/", {"id": "NDLI-DEAL-2345"}),
        ):
            code, body = self.get_json(url, **params)
            self.assertEqual(code, 200, (url, code, body))

    def test_no_private_field_in_any_public_response(self):
        for url, params in (
            (f"{API}/telemetry/", {}),
            (f"{API}/directory/", {"q": "Sample"}),
            (f"{API}/verify/", {"id": "NDLI-DEAL-2345"}),
        ):
            code, body = self.get_json(url, **params)
            self.assertEqual(code, 200)
            self.assert_no_private_fields(body, url)

    def test_failure_verdict_is_byte_identical_everywhere(self):
        """Anti-enumeration (P0): all failures produce the SAME body."""
        bodies = []
        # 1. valid-format id that does not exist
        code, body = self.get_json(f"{API}/verify/", id="NDLI-AAAA-AAAA")
        bodies.append((code, body))
        # 2. malformed id
        code, body = self.get_json(f"{API}/verify/", id="not-a-certificate")
        bodies.append((code, body))
        # 3. existing cert whose signature is broken
        cert = Certificate.objects.get(certificate_id="NDLI-DEAL-2345")
        cert.hmac_tag = ("0" if cert.hmac_tag[0] != "0" else "1") + cert.hmac_tag[1:]
        cert.save(update_fields=["hmac_tag"])
        code, body = self.get_json(f"{API}/verify/", id="NDLI-DEAL-2345")
        bodies.append((code, body))

        first = json.dumps(bodies[0][1], sort_keys=True)
        for _code, body in bodies[1:]:
            self.assertEqual(json.dumps(body, sort_keys=True), first)
        self.assertEqual({code for code, _body in bodies}, {200})
        self.assertEqual(first.count("null"), 5)  # five empty fields
        self.assertEqual(bodies[0][1]["status"], "invalid")

    def test_module1_route_surface_is_public_only(self):
        """No niche can be mounted under Module 1 (V6): the route surface pin."""
        from apps.public_api import urls as public_urls
        from apps.public_api import views as public_views

        names = sorted(p.name for p in public_urls.urlpatterns)
        self.assertEqual(names, ["directory", "telemetry", "verify"])
        for view in (
            public_views.TelemetryView,
            public_views.DirectorySearchView,
            public_views.VerifyCertificateView,
        ):
            gate = view.permission_classes[0]
            self.assertIsInstance(gate, CategoryGate)
            self.assertEqual(gate.module, "public")
            self.assertIsNone(gate.sub_roles)


class V2V3ApiBoundaryPins(PublicApiBase):
    def test_verifier_response_is_exactly_the_six_fields(self):
        code, body = self.get_json(f"{API}/verify/", id="NDLI-DEAL-2345")
        self.assertEqual(code, 200)
        self.assertEqual(
            frozenset(body.keys()), frozenset(cert_services.DISCLOSURE_FIELDS)
        )
        self.assertEqual(body["status"], "valid")
        self.assertEqual(body["club"], "Sample Cultural Club Delhi (SAMPLE)")
        self.assertEqual(
            body["institution"], "Sample Institute of Technology Delhi (SAMPLE)"
        )
        self.assertEqual(body["date"], "2025-11-14")

    def test_revoked_certificate_reports_revoked_only(self):
        code, body = self.get_json(f"{API}/verify/", id="NDLI-JKLM-6789")
        self.assertEqual(code, 200)
        self.assertEqual(body["status"], "revoked")
        self.assertEqual(
            frozenset(body.keys()), frozenset(cert_services.DISCLOSURE_FIELDS)
        )

    def test_no_key_material_in_any_public_response(self):
        """V3 API sweep: the key never leaves via an API response."""
        responses = [
            self.get_json(f"{API}/telemetry/")[1],
            self.get_json(f"{API}/directory/", q="Sample")[1],
            self.get_json(f"{API}/verify/", id="NDLI-DEAL-2345")[1],
        ]
        for body in responses:
            dumped = json.dumps(body)
            for marker in (self.key_b64, self.key_hex, self.key_b64.rstrip("=")):
                self.assertNotIn(marker, dumped)
            self.assertNotIn("hmac", dumped.lower())


class V7CacheCorrectnessPins(PublicApiBase):
    def test_cache_headers_present_and_bounded(self):
        for url, params in (
            (f"{API}/telemetry/", {}),
            (f"{API}/directory/", {}),
            (f"{API}/verify/", {"id": "NDLI-DEAL-2345"}),
        ):
            response = self.get_raw(url, **params)
            self.assertEqual(response.status_code, 200)
            cache_control = response.get("Cache-Control", "")
            self.assertIn("public", cache_control)
            self.assertIn("max-age=", cache_control)
            max_age = int(cache_control.split("max-age=")[1])
            self.assertGreater(max_age, 0)
            self.assertLessEqual(max_age, 3600)  # never stale-forever
            self.assertTrue(response.get("ETag"))

    def test_if_none_match_yields_304(self):
        first = self.get_raw(f"{API}/telemetry/")
        etag = first["ETag"]
        second = self.client.get(f"{API}/telemetry/", HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(second.status_code, 304)

    def test_content_change_invalidates_immediately(self):
        first = self.get_raw(f"{API}/telemetry/")
        first_etag = first["ETag"]
        first_body = json.loads(first.content)
        # Mutate contributing data: one more active institution in Delhi.
        state = State.objects.get(code="DELHI")
        district = District.objects.filter(state=state).first()
        Institution.objects.create(
            code="INST-NEW-001",
            legacy_id="LEG-INST-NEW-001",
            name="Freshly Added Institute (SAMPLE)",
            state=state,
            district=district,
            aishe_code="AISHE-C-199999",
        )
        second = self.get_raw(f"{API}/telemetry/")
        self.assertNotEqual(second["ETag"], first_etag)  # version reacted
        second_body = json.loads(second.content)
        delhi_before = next(r for r in first_body["states"] if r["code"] == "DELHI")
        delhi_after = next(r for r in second_body["states"] if r["code"] == "DELHI")
        self.assertEqual(delhi_after["institutions"], delhi_before["institutions"] + 1)

    def test_search_content_change_invalidates_too(self):
        first = self.get_raw(f"{API}/directory/", q="Sample")
        first_etag = first["ETag"]
        state = State.objects.get(code="DELHI")
        Institution.objects.create(
            code="INST-NEW-002",
            legacy_id="LEG-INST-NEW-002",
            name="Another Fresh Institute (SAMPLE)",
            state=state,
            aishe_code="AISHE-C-199998",
        )
        second = self.get_raw(f"{API}/directory/", q="Sample")
        self.assertNotEqual(second["ETag"], first_etag)


class V5SearchQualityPins(PublicApiBase):
    """Trigram pins — PostgreSQL only (M3-A5: dropped on SQLite, not faked)."""

    def setUp(self) -> None:
        if connection.vendor != "postgresql":
            self.skipTest("M3-A5: pg_trgm pins run on PostgreSQL only")
        super().setUp()

    def test_typo_tolerant_hit_on_known_misspelling(self):
        code, body = self.get_json(
            f"{API}/directory/", q="Sample Enginering College Pune"
        )
        self.assertEqual(code, 200)
        codes = [row["code"] for row in body["results"]]
        self.assertIn("INST-MH-001", codes)  # "Sample Engineering College Pune"

    def test_single_typo_word_still_hits(self):
        code, body = self.get_json(f"{API}/directory/", q="Engneering")
        codes = [row["code"] for row in body["results"]]
        self.assertIn("INST-MH-001", codes)

    def test_exact_code_and_aishe_hits(self):
        code, body = self.get_json(f"{API}/directory/", q="INST-MP-001")
        self.assertEqual([row["code"] for row in body["results"]], ["INST-MP-001"])
        code, body = self.get_json(f"{API}/directory/", aishe="AISHE-C-100003")
        self.assertEqual([row["code"] for row in body["results"]], ["INST-MP-001"])

    def test_pagination_is_stable_and_complete(self):
        state = State.objects.get(code="DELHI")
        for index in range(25):
            Institution.objects.create(
                code=f"INST-PG-{index:03d}",
                legacy_id=f"LEG-INST-PG-{index:03d}",
                name=f"Paged Institute {index:03d} (SAMPLE)",
                state=state,
                aishe_code=f"AISHE-C-200{index:03d}",
            )
        # q matches the 25 paged institutes; walk every page.
        seen: list[str] = []
        next_url: str | None = f"{API}/directory/"
        params: dict = {"q": "Paged"}
        pages = 0
        while next_url and pages < 20:
            response = self.client.get(next_url, params)
            body = json.loads(response.content)
            seen.extend(row["code"] for row in body["results"])
            next_url = body["next"]
            params = {}
            pages += 1
        self.assertEqual(len(seen), len(set(seen)))  # no duplicates
        self.assertEqual(len(seen), body["count"])  # no omissions
        self.assertGreater(pages, 1)  # genuinely paginated

    def test_filter_combinations_are_scoped(self):
        code, body = self.get_json(f"{API}/directory/", state="MAHARASHTRA", q="Sample")
        rows = body["results"]
        self.assertTrue(rows)
        self.assertTrue(all(r["state"]["code"] == "MAHARASHTRA" for r in rows))
        code, body = self.get_json(
            f"{API}/directory/", state="MAHARASHTRA", q="INST-DU-001"
        )
        self.assertEqual(body["results"], [])  # AND-scoped: contradictory filters

    def test_never_all_filters_expose_closed_institutions(self):
        closed = Institution.objects.create(
            code="INST-CLOSED-001",
            legacy_id="LEG-INST-CLOSED-001",
            name="Closed Institute Secretariat (SAMPLE)",
            state=State.objects.get(code="DELHI"),
            status=Institution.Status.CLOSED,
        )
        code, body = self.get_json(f"{API}/directory/", q="Secretariat")
        codes = [row["code"] for row in body["results"]]
        self.assertNotIn(closed.code, codes)
