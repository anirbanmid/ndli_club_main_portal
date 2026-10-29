"""Per-app unit pins for the Clubs app (M4 D3).

Fast, HTTP-free pins for the pure parts: slug normalisation/blocklist, the
join-token format (delegating to the ONE M3 signer) and the passkey hash
rule. The adversarial W-series pins live in ``tests/test_m4_d3_*.py``.
"""

from __future__ import annotations

import base64
import json
import os
from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from apps.accounts.hashing import hash_secret, verify_secret
from apps.clubs import join_tokens, slugs
from apps.clubs.join_tokens import JoinTokenError
from apps.clubs.models import ClubShowcase
from apps.clubs.slugs import SlugBlockedError

KEY_A_B64 = base64.b64encode(bytes(range(32))).decode()
KEYRING_JSON = json.dumps({"k2026-unit": KEY_A_B64})


class SlugUnitTests(TestCase):
    def test_normalisation_is_deterministic(self) -> None:
        for variant in ("Log_In", "log.in", "  LOG   IN  ", "log--in"):
            self.assertEqual(slugs.normalize_slug(variant), "log-in")

    def test_empty_slugs_are_blocked(self) -> None:
        for value in ("", "---", "!!!"):
            with self.subTest(value=value):
                with self.assertRaises(SlugBlockedError):
                    slugs.validate_slug(value)

    def test_clean_slugs_pass_unchanged(self) -> None:
        self.assertEqual(
            slugs.validate_slug("Robotics-Club-2026"), "robotics-club-2026"
        )

    def test_derivation_suffixes_never_reintroduce_blocked_words(self) -> None:
        taken = {"twin-club"}
        self.assertEqual(slugs.derive_slug("", "Twin Club", taken=taken), "twin-club-2")


class JoinTokenUnitTests(TestCase):
    def setUp(self) -> None:
        super().setUp()
        env_patch = mock.patch.dict(
            os.environ,
            {
                join_tokens.signing.ENV_KEYRING: KEYRING_JSON,
                join_tokens.signing.ENV_ACTIVE_KEY_ID: "k2026-unit",
            },
        )
        env_patch.start()
        self.addCleanup(env_patch.stop)

    def test_round_trip_preserves_the_signed_fields(self) -> None:
        token, expires_at = join_tokens.issue_join_token(
            club_code="CLB-UNIT", ttl_seconds=600
        )
        parsed = join_tokens.parse_join_token(token)
        self.assertEqual(parsed.club_code, "CLB-UNIT")
        self.assertEqual(parsed.expires_at, expires_at)

    def test_tampered_fields_fail_the_signature(self) -> None:
        token, _expires = join_tokens.issue_join_token(
            club_code="CLB-UNIT", ttl_seconds=600
        )
        envelope = json.loads(base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)))
        envelope["nonce"] = "different"
        forged = (
            base64.urlsafe_b64encode(
                json.dumps(envelope, separators=(",", ":"), sort_keys=True).encode()
            )
            .decode()
            .rstrip("=")
        )
        with self.assertRaises(JoinTokenError) as caught:
            join_tokens.parse_join_token(forged)
        self.assertEqual(caught.exception.code, "token_invalid")

    def test_garbage_tokens_are_rejected_without_crashing(self) -> None:
        for garbage in ("", "not-a-token", "####", "e30", "AAAA"):
            with self.subTest(garbage=garbage):
                with self.assertRaises(JoinTokenError):
                    join_tokens.parse_join_token(garbage)

    def test_expiry_is_enforced_against_the_clock(self) -> None:
        token, _expires = join_tokens.issue_join_token(
            club_code="CLB-UNIT", ttl_seconds=600
        )
        later = timezone.now() + timedelta(seconds=601)
        with self.assertRaises(JoinTokenError) as caught:
            join_tokens.parse_join_token(token, now=later)
        self.assertEqual(caught.exception.code, "token_expired")


class PasskeyHashUnitTests(TestCase):
    def test_campus_code_shape_and_hash_rule(self) -> None:
        from apps.accounts.hashing import generate_campus_code

        code = generate_campus_code("KGP")
        self.assertRegex(code, r"^KGP-[A-Z2-9]{4}$")
        self.assertTrue(verify_secret(code, hash_secret(code)))
        self.assertNotEqual(code, hash_secret(code))

    def test_blocked_slug_is_refused_by_the_model_write(self) -> None:
        from apps.domain.models import Club, Institution, State, Zone

        zone = Zone.objects.create(code="U1", name="Unit zone")
        state = State.objects.create(code="U1S", name="Unit state", zone=zone)
        institution = Institution.objects.create(
            code="U1I", legacy_id="LEG-U1I", name="Unit institution", state=state
        )
        club = Club.objects.create(
            code="U1C", institution=institution, name="Unit club"
        )
        with self.assertRaises(SlugBlockedError):
            ClubShowcase.objects.create(club=club, slug="sign_up")


class CanonicalClubsSingleSourceTests(TestCase):
    def test_canonical_clubs_returns_unified_dataset(self) -> None:
        from apps.domain.clubs import get_all_canonical_clubs

        clubs = get_all_canonical_clubs()
        self.assertGreaterEqual(len(clubs), 11)
        dati = next((c for c in clubs if c["id"] == "NDLI-EMP01-002"), None)
        self.assertIsNotNone(dati)
        assert dati is not None
        self.assertEqual(dati["name"], "Delhi Advanced Technical Institute")
        self.assertEqual(dati["registrationNo"], "REG-2025-EMP01-002")
        self.assertEqual(dati["dateOfApproval"], "2024-08-15")

    def test_clubs_endpoint_is_publicly_accessible(self) -> None:
        response = self.client.get("/api/v1/clubs/showcase/canonical/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("clubs", data)
        self.assertGreaterEqual(data["count"], 11)
