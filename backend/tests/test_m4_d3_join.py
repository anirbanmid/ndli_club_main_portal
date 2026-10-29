"""M4 D3 — campus passkey / QR / self-join pins (BRIEF_M4 §5: W5).

* **W5 passkey/QR** — expired token fails · replayed join fails · regenerate
  invalidates old · rate limit engages · student joins ONLY the target club.
* **Passkey lifecycle** — issue (plaintext once, hash at rest) · single
  active per club · revoke · TTL.
* **Join flow** — OTP (M1 machinery) → pending roster request → club admin
  confirms in the roster view → exactly one membership.
"""

from __future__ import annotations

import base64
import json
import os
import re
from datetime import timedelta
from typing import Any
from unittest import mock

from django.core import mail
from django.test import override_settings
from django.utils import timezone

from apps.accounts.hashing import verify_secret
from apps.accounts.models import Category, SubRole
from apps.clubs import join_tokens, services
from apps.clubs.join_tokens import JoinTokenError
from apps.clubs.models import CampusPasskey
from apps.clubs.services import ClubError
from apps.domain.models import Membership
from apps.members.models import JoinRequest

from .m2_support import build_zone_graph
from .support import M1PinTestCase as TestCase
from .support import make_user
from .test_m4_d3_showcase import make_club_admin

LOC = {"EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend"}

# Fixed test keyring (never used outside tests) — same shape as M3's pins.
KEY_A_B64 = base64.b64encode(bytes(range(32))).decode()
KEYRING_JSON = json.dumps({"k2026-d3": KEY_A_B64})


class JoinPinTestCase(TestCase):
    """Shared fixture: zone graph + club admin + signer keyring + helpers."""

    def setUp(self) -> None:
        super().setUp()
        env_patch = mock.patch.dict(
            os.environ,
            {
                join_tokens.signing.ENV_KEYRING: KEYRING_JSON,
                join_tokens.signing.ENV_ACTIVE_KEY_ID: "k2026-d3",
            },
        )
        env_patch.start()
        self.addCleanup(env_patch.stop)
        self.graph = build_zone_graph()
        self.club = self.graph["NORTH"]["club"]
        self.other_club = self.graph["WEST"]["club"]
        self.admin = make_club_admin("d3joinadmin", self.club)
        self.other_admin = make_club_admin("d3joinotheradmin", self.other_club)

    def otp_for(self, email: str) -> str:
        """Recover the 6-digit code from the captured outbox (M1 pattern)."""
        codes: list[str] = []
        for message in mail.outbox:
            if email in message.to:
                codes.extend(re.findall(r"\b(\d{6})\b", str(message.body)))
        assert codes, f"no OTP emailed to {email}"
        return codes[-1]

    def issue(self, club: Any = None) -> str:
        return services.issue_passkey(club=club or self.club, issued_by=self.admin)

    def join_body(self, **fields: Any) -> dict[str, Any]:
        body: dict[str, Any] = {"email": "student.one@example.test"}
        body.update(fields)
        return body


@override_settings(**LOC)
class PasskeyLifecycleTests(JoinPinTestCase):
    """Issue once · hash at rest · regenerate invalidates · revoke · TTL."""

    def test_issue_returns_plaintext_once_and_stores_only_the_hash(self) -> None:
        code = self.issue()
        row = CampusPasskey.objects.get(club=self.club)
        stored = {row.code_hash, str(row.created_by_id)}
        self.assertNotIn(code, stored)
        self.assertTrue(verify_secret(code.strip().upper(), row.code_hash))
        self.assertEqual(row.status_payload.get("passkey", None), None)

    def test_one_active_passkey_per_club_issue_is_refused(self) -> None:
        self.issue()
        with self.assertRaises(ClubError) as caught:
            self.issue()
        self.assertEqual(caught.exception.code, "passkey_exists")
        self.assertEqual(caught.exception.http_status, 409)

    def test_regenerate_invalidates_the_old_code(self) -> None:
        old = self.issue()
        new = services.regenerate_passkey(club=self.club, issued_by=self.admin)
        self.assertNotEqual(old, new)
        with self.assertRaises(ClubError) as caught:
            services.resolve_passkey(old)
        self.assertEqual(caught.exception.code, "passkey_invalid")
        self.assertEqual(services.resolve_passkey(new).club, self.club)

    def test_revoked_passkey_never_resolves(self) -> None:
        code = self.issue()
        services.revoke_passkey(club=self.club)
        with self.assertRaises(ClubError) as caught:
            services.resolve_passkey(code)
        self.assertEqual(caught.exception.code, "passkey_revoked")

    def test_expired_passkey_never_resolves(self) -> None:
        code = self.issue()
        row = CampusPasskey.objects.get(club=self.club)
        row.expires_at = timezone.now() - timedelta(seconds=1)
        row.save(update_fields=["expires_at"])
        with self.assertRaises(ClubError) as caught:
            services.resolve_passkey(code)
        self.assertEqual(caught.exception.code, "passkey_expired")

    def test_passkey_is_case_and_space_insensitive(self) -> None:
        code = self.issue()
        typed = f" {code.lower()} ".replace("-", " - ")
        self.assertEqual(services.resolve_passkey(typed).club, self.club)

    def test_reissue_after_revoke_mints_a_fresh_code(self) -> None:
        old = self.issue()
        services.revoke_passkey(club=self.club)
        new = services.regenerate_passkey(club=self.club, issued_by=self.admin)
        self.assertNotEqual(old, new)
        self.assertEqual(services.resolve_passkey(new).club, self.club)


@override_settings(**LOC)
class JoinTokenQrTests(JoinPinTestCase):
    """The dynamic QR wraps a signed, expiring join URL (M3 signer, P4)."""

    def _join_url(self) -> str:
        self.client.force_login(self.admin)
        response = self.client.get("/api/v1/clubs/dashboard/passkey/join-url/")
        assert response.status_code == 200, response.content
        self.client.logout()
        return response.json()["join_url"]

    def test_join_url_carries_a_signed_expiring_token(self) -> None:
        join_url = self._join_url()
        self.assertIn("#t=", join_url)
        token = join_url.split("#t=", 1)[1]
        parsed = join_tokens.parse_join_token(token)
        self.assertEqual(parsed.club_code, self.club.code)
        self.assertGreater(parsed.expires_at, timezone.now())

    def test_w5_expired_join_token_fails(self) -> None:
        token, _expires = join_tokens.issue_join_token(
            club_code=self.club.code, ttl_seconds=-10
        )
        with self.assertRaises(JoinTokenError) as caught:
            join_tokens.parse_join_token(token)
        self.assertEqual(caught.exception.code, "token_expired")
        response = self.client.post(
            "/api/v1/clubs/join/otp/request/",
            data=self.join_body(token=token),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.json()["code"], "token_expired")

    def test_forged_join_token_fails(self) -> None:
        token, _expires = join_tokens.issue_join_token(
            club_code=self.club.code, ttl_seconds=600
        )
        raw = json.loads(base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)))
        raw["club"] = self.other_club.code  # re-bind to another club
        forged = (
            base64.urlsafe_b64encode(
                json.dumps(raw, separators=(",", ":"), sort_keys=True).encode()
            )
            .decode()
            .rstrip("=")
        )
        with self.assertRaises(JoinTokenError) as caught:
            join_tokens.parse_join_token(forged)
        self.assertEqual(caught.exception.code, "token_invalid")

    def test_qr_svg_renders_and_is_never_cached(self) -> None:
        self.client.force_login(self.admin)
        response = self.client.get("/api/v1/clubs/dashboard/passkey/qr.svg")
        self.client.logout()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/svg+xml")
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertIn(b"<svg", response.content)

    def test_qr_renders_a_fresh_token_on_every_load(self) -> None:
        self.client.force_login(self.admin)
        first = self.client.get("/api/v1/clubs/dashboard/passkey/join-url/").json()
        second = self.client.get("/api/v1/clubs/dashboard/passkey/join-url/").json()
        self.client.logout()
        self.assertNotEqual(first["join_url"], second["join_url"])


@override_settings(**LOC)
class JoinFlowTests(JoinPinTestCase):
    """Passkey/QR → OTP → pending roster row → admin confirmation."""

    def test_join_needs_a_verified_otp_first(self) -> None:
        code = self.issue()
        response = self.client.post(
            "/api/v1/clubs/join/complete/",
            data=self.join_body(passkey=code, code="000000"),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(JoinRequest.objects.exists())

    def test_otp_request_is_enumeration_safe(self) -> None:
        code = self.issue()
        known = self.client.post(
            "/api/v1/clubs/join/otp/request/",
            data=self.join_body(passkey=code, email="someone@example.test"),
            content_type="application/json",
        )
        unknown = self.client.post(
            "/api/v1/clubs/join/otp/request/",
            data=self.join_body(passkey=code, email="nobody@example.test"),
            content_type="application/json",
        )
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.content, unknown.content)

    def test_campus_self_join_lands_pending_until_the_admin_confirms(self) -> None:
        code = self.issue()
        email = "student.joiner@example.test"
        requested = self.client.post(
            "/api/v1/clubs/join/otp/request/",
            data=self.join_body(passkey=code, email=email),
            content_type="application/json",
        )
        self.assertEqual(requested.status_code, 202)
        completed = self.client.post(
            "/api/v1/clubs/join/complete/",
            data=self.join_body(passkey=code, email=email, code=self.otp_for(email)),
            content_type="application/json",
        )
        self.assertEqual(completed.status_code, 201, completed.content)
        self.assertEqual(completed.json()["status"], "pending")

        join_request = JoinRequest.objects.get()
        self.assertEqual(join_request.club, self.club)
        self.assertEqual(join_request.status, JoinRequest.Status.PENDING)
        self.assertEqual(join_request.source, JoinRequest.Source.PASSKEY)
        # The student identity is created scoped to THIS club (M2U).
        student = join_request.user
        self.assertEqual(student.category, Category.STUDENT_MEMBER)
        self.assertEqual(student.club_code, self.club.code)
        # Pending is NOT a membership: the roster is untouched yet.
        self.assertFalse(Membership.objects.filter(user=student).exists())

        # Club admin confirms in the roster view → exactly one membership.
        self.client.force_login(self.admin)
        confirmed = self.client.post(
            f"/api/v1/members/joins/{join_request.pk}/confirm/"
        )
        self.assertEqual(confirmed.status_code, 201, confirmed.content)
        membership = Membership.objects.get(user=student)
        self.assertEqual(membership.club, self.club)
        self.assertEqual(membership.status, Membership.Status.ACTIVE)
        join_request.refresh_from_db()
        self.assertEqual(join_request.status, JoinRequest.Status.APPROVED)

    def test_w5_replayed_join_fails(self) -> None:
        code = self.issue()
        email = "student.replay@example.test"
        self.client.post(
            "/api/v1/clubs/join/otp/request/",
            data=self.join_body(passkey=code, email=email),
            content_type="application/json",
        )
        otp = self.otp_for(email)
        body = self.join_body(passkey=code, email=email, code=otp)
        first = self.client.post(
            "/api/v1/clubs/join/complete/", data=body, content_type="application/json"
        )
        self.assertEqual(first.status_code, 201, first.content)
        # Byte-identical replay: the OTP is single-use (M1) — never a 2xx.
        replay = self.client.post(
            "/api/v1/clubs/join/complete/", data=body, content_type="application/json"
        )
        self.assertIn(replay.status_code, (400, 429))
        # A second, correctly OTP'd join of the same student piles up NOTHING.
        self.client.post(
            "/api/v1/clubs/join/otp/request/",
            data=self.join_body(passkey=code, email=email),
            content_type="application/json",
        )
        again = self.client.post(
            "/api/v1/clubs/join/complete/",
            data=self.join_body(passkey=code, email=email, code=self.otp_for(email)),
            content_type="application/json",
        )
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.json()["code"], "join_pending_exists")
        self.assertEqual(JoinRequest.objects.count(), 1)

    def test_w5_regenerate_invalidates_old_passkey_joins(self) -> None:
        old = self.issue()
        new = services.regenerate_passkey(club=self.club, issued_by=self.admin)
        response = self.client.post(
            "/api/v1/clubs/join/otp/request/",
            data=self.join_body(passkey=old),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "passkey_invalid")
        fresh = self.client.post(
            "/api/v1/clubs/join/otp/request/",
            data=self.join_body(passkey=new),
            content_type="application/json",
        )
        self.assertEqual(fresh.status_code, 202)

    def test_w5_rate_limit_engages_on_the_join_door(self) -> None:
        self.issue()
        statuses = []
        for _attempt in range(services.JOIN_ATTEMPT_LIMIT + 1):
            response = self.client.post(
                "/api/v1/clubs/join/otp/request/",
                data=self.join_body(passkey="NOPE-0000"),
                content_type="application/json",
            )
            statuses.append(response.status_code)
        self.assertEqual(statuses[-1], 429)
        self.assertEqual(
            statuses.count(429), 1, f"throttle engaged too early: {statuses}"
        )

    def test_w5_student_joins_only_the_target_club(self) -> None:
        # The credential names the club: a club-A passkey joins club A even
        # when the student also holds (or wishes for) club B.
        code = self.issue()  # club A (NORTH)
        email = "student.scoped@example.test"
        self.client.post(
            "/api/v1/clubs/join/otp/request/",
            data=self.join_body(passkey=code, email=email),
            content_type="application/json",
        )
        completed = self.client.post(
            "/api/v1/clubs/join/complete/",
            data=self.join_body(passkey=code, email=email, code=self.otp_for(email)),
            content_type="application/json",
        )
        self.assertEqual(completed.status_code, 201, completed.content)
        join_request = JoinRequest.objects.get()
        self.assertEqual(join_request.club, self.club)
        self.assertNotEqual(join_request.club, self.other_club)
        # The QR token path is bound to its club just as hard.
        token, _expires = join_tokens.issue_join_token(
            club_code=self.club.code, ttl_seconds=600
        )
        parsed = join_tokens.parse_join_token(token)
        self.assertEqual(parsed.club_code, self.club.code)

    def test_qr_join_reaches_pending_with_source_qr(self) -> None:
        token, _expires = join_tokens.issue_join_token(
            club_code=self.club.code, ttl_seconds=600
        )
        email = "student.qr@example.test"
        self.client.post(
            "/api/v1/clubs/join/otp/request/",
            data=self.join_body(token=token, email=email),
            content_type="application/json",
        )
        completed = self.client.post(
            "/api/v1/clubs/join/complete/",
            data=self.join_body(token=token, email=email, code=self.otp_for(email)),
            content_type="application/json",
        )
        self.assertEqual(completed.status_code, 201, completed.content)
        join_request = JoinRequest.objects.get()
        self.assertEqual(join_request.source, JoinRequest.Source.QR)
        self.assertEqual(join_request.club, self.club)

    def test_non_student_account_cannot_self_join(self) -> None:
        code = self.issue()
        email = "authority@example.test"
        make_user(
            username="d3authority",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email=email,
            institution_code=self.other_club.institution.code,
            club_code=self.other_club.code,
        )
        self.client.post(
            "/api/v1/clubs/join/otp/request/",
            data=self.join_body(passkey=code, email=email),
            content_type="application/json",
        )
        response = self.client.post(
            "/api/v1/clubs/join/complete/",
            data=self.join_body(passkey=code, email=email, code=self.otp_for(email)),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(JoinRequest.objects.exists())

    def test_unknown_passkey_is_rejected_without_revealing_anything(self) -> None:
        response = self.client.post(
            "/api/v1/clubs/join/otp/request/",
            data=self.join_body(passkey="FAKE-0000"),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "passkey_invalid")
        self.assertNotIn("@", response.content.decode("utf-8"))
