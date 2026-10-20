"""M3 Phase 1 adversarial pins — certificate core (BRIEF_M3 §5, pins V1–V4).

Named pins (evidence, not claims):

* **V1 verifier correctness** — valid cert verifies · wrong id fails ·
  tampered payload fails · tampered tag fails · unknown key id fails ·
  **revoked cert never succeeds** · the tag comparison is timing-safe
  (source-pinned ``hmac.compare_digest``, never ``==``).
* **V2 disclosure floor** — the verifier discloses EXACTLY the six public
  fields (name/club/institution/event_title/date/status) and, as a named
  test, assertingly does NOT contain email, mobile or APAAR identifiers.
* **V3 HMAC key isolation** — the key material never appears in any DB
  column of the certificate tables, any log line produced by sign/verify,
  or the verifier's result/disclosure payload (the API serialiser builds
  from exactly this payload, P4 — the endpoint sweep lands with the V6 pin
  when Phase 2 builds the routes).
* **V4 id format** — generated ids match the unambiguous alphabet + display
  pattern; ``0/O/1/I`` never appear; the collision retry is exercised.

Everything is offline and deterministic: fixed test keys, no network.
"""
from __future__ import annotations

import base64
import inspect
import json
import logging
import tempfile
from datetime import date
from pathlib import Path
from unittest import mock

from django.core.management import call_command
from django.db import IntegrityError, transaction

from apps.audit.models import AuditLog
from apps.certificates import ids, services, signing
from apps.certificates import seed as cert_seed
from apps.certificates.models import (
    Certificate,
    CertificateCategory,
    Revocation,
    certificate_id_is_valid,
)
from apps.domain.seed import load_samples as load_domain_samples

from .m2_support import build_zone_graph
from .support import Category, SubRole, make_user
from .support import M1PinTestCase as TestCase

# --- fixed test keyring (never used outside tests) ------------------------

KEY_A_B64 = base64.b64encode(bytes(range(32))).decode()
KEY_B_B64 = base64.b64encode(bytes(range(32, 64))).decode()
KEY_A_RAW = bytes(range(32))
KEYRING_JSON = json.dumps({"k2026-a": KEY_A_B64, "k2026-b": KEY_B_B64})

#: Marker strings that must never leak (V3): the b64 form, the raw-bytes hex
#: and the raw bytes themselves as latin-1 text.
SECRET_MARKERS = (
    KEY_A_B64,
    KEY_A_B64.rstrip("="),
    KEY_A_RAW.hex(),
    KEY_A_RAW.hex().upper(),
)


class _RecordingHandler(logging.Handler):
    """Collects every formatted log line emitted during a block."""

    def __init__(self) -> None:
        super().__init__()
        self.lines: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:  # pragma: no cover - trivial
        self.lines.append(self.format(record))


class CertPinTestCase(TestCase):
    """Shared fixture: zone graph + holder + keyring + issuance helper."""

    def setUp(self) -> None:
        super().setUp()
        import os
        from unittest import mock

        env_patch = mock.patch.dict(
            os.environ,
            {
                signing.ENV_KEYRING: KEYRING_JSON,
                signing.ENV_ACTIVE_KEY_ID: "k2026-a",
            },
        )
        env_patch.start()
        self.addCleanup(env_patch.stop)

        self.graph = build_zone_graph()
        self.club = self.graph["NORTH"]["club"]
        self.institution = self.graph["NORTH"]["institution"]
        self.holder = make_user(
            username="cert-holder",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            email="holder.leak@example.test",
            phone="+911234500001",
            alt_phone="+911234500002",
        )

    def issue(self, **overrides) -> Certificate:
        """Issue one signed certificate (the real issuance path)."""
        fields = {
            "holder": self.holder,
            "club": self.club,
            "event_ref": "EVT-TEST-001",
            "event_title": "Sample Event",
            "event_date": date(2026, 1, 15),
            "issue_date": date(2026, 1, 16),
            "category": CertificateCategory.PARTICIPATION,
        }
        fields.update(overrides)
        key_id = fields.pop("hmac_key_id", signing.active_key_id())
        cert = Certificate.objects.create(
            certificate_id=ids.format_certificate_id(ids.random_certificate_id_body()),
            hmac_key_id=key_id,
            hmac_tag="",
            **fields,
        )
        cert.hmac_tag = signing.sign(
            signing.canonical_payload_for(cert), key_id=key_id
        )
        cert.save(update_fields=["hmac_tag"])
        return cert


# --- V1: verifier correctness --------------------------------------------


class V1VerifierCorrectnessPins(CertPinTestCase):
    def test_valid_certificate_verifies(self):
        cert = self.issue()
        result = services.verify_certificate(cert.certificate_id)
        self.assertEqual(result.status, services.STATUS_VALID)
        self.assertTrue(result.ok)

    def test_unknown_id_fails_closed(self):
        result = services.verify_certificate("NDLI-0000-0000")
        self.assertEqual(result.status, services.STATUS_NOT_FOUND)
        self.assertFalse(result.ok)
        self.assertIsNone(result.disclosure)

    def test_tampered_signature_fails(self):
        cert = self.issue()
        tag = cert.hmac_tag
        cert.hmac_tag = ("0" if tag[0] != "0" else "1") + tag[1:]
        cert.save(update_fields=["hmac_tag"])
        result = services.verify_certificate(cert.certificate_id)
        self.assertEqual(result.status, services.STATUS_INVALID)
        self.assertFalse(result.ok)
        self.assertIsNone(result.disclosure)

    def test_tampered_signed_field_fails(self):
        cert = self.issue()
        # Mutate a signed field AFTER signing: the tag no longer matches.
        cert.event_ref = "EVT-EVIL-999"
        cert.save(update_fields=["event_ref"])
        result = services.verify_certificate(cert.certificate_id)
        self.assertEqual(result.status, services.STATUS_INVALID)
        self.assertIsNone(result.disclosure)

    def test_unknown_key_id_never_verifies(self):
        cert = self.issue()
        cert.hmac_key_id = "k-rotated-away"
        cert.save(update_fields=["hmac_key_id"])
        result = services.verify_certificate(cert.certificate_id)
        self.assertEqual(result.status, services.STATUS_INVALID)

    def test_rotation_keeps_history_verifiable(self):
        cert = self.issue()
        # Sign a second cert under the OTHER key; both must verify.
        cert_b = self.issue(hmac_key_id="k2026-b")
        self.assertEqual(cert_b.hmac_key_id, "k2026-b")
        self.assertEqual(
            services.verify_certificate(cert.certificate_id).status,
            services.STATUS_VALID,
        )
        self.assertEqual(
            services.verify_certificate(cert_b.certificate_id).status,
            services.STATUS_VALID,
        )

    def test_revoked_certificate_never_succeeds(self):
        cert = self.issue()
        Revocation.objects.create(certificate=cert, reason="issued in error")
        result = services.verify_certificate(cert.certificate_id)
        self.assertEqual(result.status, services.STATUS_REVOKED)
        self.assertFalse(result.ok)

    def test_signature_comparison_is_constant_time_source_pinned(self):
        """V1 source pin: verification compares with hmac.compare_digest."""
        source = inspect.getsource(signing.verify_signature)
        normalised = "".join(source.split())
        self.assertIn("hmac.compare_digest(expected,cert.hmac_tag)", normalised)
        self.assertNotIn("==", normalised)

    def test_canonical_payload_is_injective(self):
        """Length-prefixing: field boundaries cannot be re-cut (no injection)."""
        p1 = signing.canonical_payload(
            certificate_id="NDLI-AAAA-AAAA",
            holder_id=1,
            club_id=23,
            event_ref="EVT-1",
            issue_date="2026-01-16",
        )
        p2 = signing.canonical_payload(
            certificate_id="NDLI-AAAA-AAAA",
            holder_id=1,
            club_id=2,
            event_ref="3EVT-1",
            issue_date="2026-01-16",
        )
        self.assertNotEqual(p1, p2)


# --- V2: disclosure floor -------------------------------------------------


class V2DisclosureFloorPins(CertPinTestCase):
    def test_disclosure_is_exactly_the_six_public_fields(self):
        cert = self.issue()
        result = services.verify_certificate(cert.certificate_id)
        assert result.disclosure is not None
        self.assertEqual(
            frozenset(result.disclosure.keys()),
            frozenset(services.DISCLOSURE_FIELDS),
        )
        self.assertEqual(set(services.DISCLOSURE_FIELDS), {
            "name", "club", "institution", "event_title", "date", "status",
        })
        self.assertEqual(result.disclosure["club"], self.club.name)
        self.assertEqual(result.disclosure["institution"], self.institution.name)
        self.assertEqual(result.disclosure["event_title"], "Sample Event")
        self.assertEqual(result.disclosure["date"], "2026-01-15")
        self.assertEqual(result.disclosure["status"], services.STATUS_VALID)

    def test_disclosure_never_contains_email_mobile_or_apaar(self):
        """V2 named test: private identifiers are absent, not just unused."""
        cert = self.issue()
        result = services.verify_certificate(cert.certificate_id)
        assert result.disclosure is not None
        dumped = json.dumps(result.disclosure).lower()
        for forbidden_key in ("email", "mobile", "phone", "apaar", "alt_phone"):
            self.assertNotIn(forbidden_key, dumped)
        for secret_value in (
            "holder.leak@example.test",
            "+911234500001",
            "+911234500002",
            self.holder.email,
        ):
            self.assertNotIn(secret_value, json.dumps(result.disclosure))

    def test_revoked_disclosure_is_equally_bounded(self):
        cert = self.issue()
        Revocation.objects.create(certificate=cert, reason="duplicate")
        result = services.verify_certificate(cert.certificate_id)
        assert result.disclosure is not None
        self.assertEqual(
            frozenset(result.disclosure.keys()),
            frozenset(services.DISCLOSURE_FIELDS),
        )
        self.assertNotIn("email", json.dumps(result.disclosure).lower())


# --- V3: HMAC key isolation ----------------------------------------------


class V3KeyIsolationPins(CertPinTestCase):
    def test_key_material_is_in_no_certificate_db_column(self):
        cert = self.issue()
        Revocation.objects.create(certificate=cert, reason="sweep")
        dumped_rows = []
        for model in (Certificate, Revocation):
            field_names = [f.name for f in model._meta.concrete_fields]
            for row in model.objects.values_list(*field_names):
                dumped_rows.append(repr(row))
        blob = "".join(dumped_rows)
        for marker in SECRET_MARKERS:
            self.assertNotIn(marker, blob)

    def test_sign_and_verify_emit_no_key_in_logs(self):
        handler = _RecordingHandler()
        handler.setFormatter(logging.Formatter("%(name)s %(levelname)s %(message)s"))
        root = logging.getLogger()
        root.addHandler(handler)
        try:
            cert = self.issue()
            services.verify_certificate(cert.certificate_id)
            services.verify_certificate("NDLI-0000-0000")
        finally:
            root.removeHandler(handler)
        blob = "\n".join(handler.lines)
        for marker in SECRET_MARKERS:
            self.assertNotIn(marker, blob)

    def test_verifier_result_and_disclosure_hide_the_key(self):
        cert = self.issue()
        result = services.verify_certificate(cert.certificate_id)
        blob = repr(result) + json.dumps(result.disclosure or {})
        for marker in SECRET_MARKERS:
            self.assertNotIn(marker, blob)

    def test_key_stays_out_of_model_fields(self):
        """No certificate field can carry key material by construction."""
        keyish = [
            f.name
            for f in Certificate._meta.concrete_fields
            if "key" in f.name.lower() and f.name != "hmac_key_id"
        ]
        self.assertEqual(keyish, [])
        cert = self.issue()
        self.assertNotIn(cert.hmac_key_id, SECRET_MARKERS)
        self.assertEqual(cert.hmac_key_id, "k2026-a")

    def test_keyring_rejects_weak_keys(self):
        """A <32-byte key is refused outright (defence of the key material)."""
        import os
        from unittest import mock

        weak = json.dumps({"k": base64.b64encode(b"short").decode()})
        with mock.patch.dict(os.environ, {signing.ENV_KEYRING: weak}):
            with self.assertRaises(signing.CertificateSigningError):
                signing.active_key_id()


# --- V4: id format -------------------------------------------------------


class V4IdFormatPins(CertPinTestCase):
    def test_generated_ids_match_pattern_and_alphabet(self):
        for _ in range(500):
            body = ids.random_certificate_id_body()
            cert_id = ids.format_certificate_id(body)
            self.assertTrue(certificate_id_is_valid(cert_id), cert_id)
            self.assertTrue(ids.is_valid_certificate_id(cert_id), cert_id)
            self.assertEqual(len(cert_id), len(ids.CERT_ID_PATTERN))
            body = cert_id[5:9] + cert_id[10:14]
            for forbidden in ids.CERT_ID_FORBIDDEN:
                self.assertNotIn(forbidden, body)

    def test_format_rejects_bad_bodies(self):
        with self.assertRaises(ValueError):
            ids.format_certificate_id("SHORT")
        with self.assertRaises(ValueError):
            ids.format_certificate_id("AAAA0AAA")  # forbidden 0
        with self.assertRaises(ValueError):
            ids.format_certificate_id("AAAA1AAA")  # forbidden 1

    def test_collision_retry_is_exercised(self):
        attempts: list[str] = []

        def save_with_two_collisions(body: str) -> None:
            attempts.append(body)
            if len(attempts) <= 2:
                raise IntegrityError("duplicate key value violates unique constraint")

        cert_id = ids.generate_unique_certificate_id(save_with_two_collisions)
        self.assertEqual(len(attempts), 3)
        self.assertTrue(ids.is_valid_certificate_id(cert_id))

    def test_database_is_the_collision_backstop(self):
        cert = self.issue()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Certificate.objects.create(
                certificate_id=cert.certificate_id,
                hmac_key_id="k2026-a",
                hmac_tag="0" * 64,
                holder=self.holder,
                club=self.club,
                event_ref="EVT-TEST-002",
                event_title="Dup",
                event_date=date(2026, 1, 15),
                issue_date=date(2026, 1, 16),
            )

    def test_id_fits_db_column_width(self):
        """Width pin (SQLite-luck class): pattern width == column width.

        SQLite silently truncates/ignores varchar length, Postgres does not
        — so every generated id must fit the real column.
        """
        field = Certificate._meta.get_field("certificate_id")
        self.assertEqual(field.max_length, len(ids.CERT_ID_PATTERN))
        for _ in range(50):
            cert_id = ids.format_certificate_id(ids.random_certificate_id_body())
            self.assertLessEqual(len(cert_id), field.max_length)  # type: ignore[misc]

    def test_model_validator_rejects_malformed_ids(self):
        from django.core.exceptions import ValidationError

        cert = self.issue()
        for bad in ("NDLI-AAAA-AAAA0", "NDLI-0000-0000", "XXLI-AAAA-AAAA"):
            cert.certificate_id = bad
            with self.assertRaises(ValidationError):
                cert.full_clean(exclude=["hmac_tag"])
            self.assertFalse(certificate_id_is_valid(bad))


# --- fixtures + seeding (Phase 1 remainder) -------------------------------


class SeedFixturePins(CertPinTestCase):
    """Fixture loader discipline: whitelist, bounded reset, real signing."""

    def _seed(self, **kwargs):
        """The realistic order: domain samples first, then certificates."""
        load_domain_samples()
        return cert_seed.load_certificate_samples(**kwargs)

    def _write_fixture(self, rows: list[dict]) -> Path:
        tmp = Path(tempfile.mkdtemp(prefix="m3cert")) / "certificates.json"
        tmp.write_text(json.dumps(rows), encoding="utf-8")
        return tmp

    def _good_row(self, **overrides) -> dict:
        row = {
            "certificate_id": "NDLI-DEAL-2345",
            "username": "STUDENT-01",
            "club": "CLB-DU-CULT",
            "category": "Participation",
            "event_ref": "EVT-DU-CULT-001",
            "event_title": "Annual Cultural Fest 2025 (SAMPLE)",
            "event_date": "2025-11-14",
            "issue_date": "2025-11-15",
        }
        row.update(overrides)
        return row

    def test_fixtures_load_and_verify(self):
        result = self._seed()
        self.assertEqual(result.counts["certificates"]["created"], 6)
        self.assertEqual(Certificate.objects.count(), 6)
        # Every non-revoked fixture verifies as VALID through the real path.
        revoked = Revocation.objects.values_list(
            "certificate__certificate_id", flat=True
        )
        for cert in Certificate.objects.exclude(certificate_id__in=revoked):
            outcome = services.verify_certificate(cert.certificate_id)
            self.assertEqual(outcome.status, services.STATUS_VALID, cert)
        # The revoked fixture verifies as REVOKED, never valid.
        self.assertIn("NDLI-JKLM-6789", revoked)
        self.assertEqual(
            services.verify_certificate("NDLI-JKLM-6789").status,
            services.STATUS_REVOKED,
        )
        # The 'Club Registration' category is present (design constraint).
        self.assertTrue(
            Certificate.objects.filter(
                category=CertificateCategory.CLUB_REGISTRATION
            ).exists()
        )
        # The load is audited (P0).
        self.assertTrue(AuditLog.objects.filter(action="certificates.seed").exists())

    def test_fixture_load_is_idempotent(self):
        self._seed()
        second = cert_seed.load_certificate_samples()
        self.assertEqual(second.counts["certificates"]["created"], 0)
        self.assertEqual(second.counts["certificates"]["updated"], 6)
        self.assertEqual(Certificate.objects.count(), 6)
        # Idempotent re-run keeps every signature intact.
        for cert in Certificate.objects.all():
            self.assertEqual(
                services.verify_certificate(cert.certificate_id).status in
                (services.STATUS_VALID, services.STATUS_REVOKED),
                True,
                cert,
            )

    def test_reset_is_bounded_to_fixture_rows(self):
        self._seed()
        stranger = self.issue()  # NOT a fixture row
        result = cert_seed.load_certificate_samples(reset=True)
        self.assertEqual(result.removed["certificates"], 6)
        self.assertEqual(Certificate.objects.count(), 7)  # 6 re-seeded + stranger
        self.assertTrue(
            Certificate.objects.filter(certificate_id=stranger.certificate_id).exists()
        )

    def test_unknown_reference_is_rejected_atomically(self):
        load_domain_samples()
        poisoned = self._write_fixture(
            [self._good_row(username="NO-SUCH-USER-XYZ")]
        )
        with mock.patch.object(cert_seed, "CERT_SAMPLES_FILE", poisoned):
            with self.assertRaises(cert_seed.SeedValidationError):
                cert_seed.load_certificate_samples()
        self.assertEqual(Certificate.objects.count(), 0)  # nothing written

    def test_invalid_certificate_id_is_rejected(self):
        load_domain_samples()
        poisoned = self._write_fixture(
            [self._good_row(certificate_id="NDLI-0000-0000")]
        )
        with mock.patch.object(cert_seed, "CERT_SAMPLES_FILE", poisoned):
            with self.assertRaises(cert_seed.SeedValidationError):
                cert_seed.load_certificate_samples()
        self.assertEqual(Certificate.objects.count(), 0)

    def test_mass_assignment_is_rejected(self):
        """Whitelist pin: an injected hmac_key_id/hmac_tag is refused."""
        load_domain_samples()
        poisoned = self._write_fixture(
            [
                self._good_row(
                    hmac_key_id="evil-key",
                    hmac_tag="deadbeef",
                )
            ]
        )
        with mock.patch.object(cert_seed, "CERT_SAMPLES_FILE", poisoned):
            with self.assertRaises(cert_seed.SeedValidationError):
                cert_seed.load_certificate_samples()
        self.assertEqual(Certificate.objects.count(), 0)

    def test_fixture_file_never_carries_key_material_or_tags(self):
        """V3 pin: the fixture file is data only — no tags, no key markers."""
        text = cert_seed.CERT_SAMPLES_FILE.read_text(encoding="utf-8")
        lowered = text.lower()
        self.assertNotIn("hmac", lowered)
        for marker in SECRET_MARKERS:
            self.assertNotIn(marker, text)
        for row in json.loads(text):
            self.assertNotIn("hmac_tag", row)
            self.assertNotIn("hmac_key_id", row)

    def test_command_wrapper_seeds_end_to_end(self):
        load_domain_samples()
        call_command("seed_certificates", verbosity=0)
        self.assertEqual(Certificate.objects.count(), 6)
