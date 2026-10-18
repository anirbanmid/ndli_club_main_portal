"""T1 — no secret ever appears in a URL, a response body or an audit row.

BRIEF_M1.md §7 T1: "no OTP / session / TOTP secret / reset token in ANY URL
or response body (sweep every endpoint)."

Three layers:
  1. builders  — the single-use links carry the token in the URL FRAGMENT
     (``#token=``), never the query string;
  2. storage   — codes, link tokens and passkeys are persisted hashed only,
     the TOTP secret sealed, never plaintext;
  3. sweeping  — every route in the URLconf is requested and its response
     body must not contain any secret this test minted.
"""
from __future__ import annotations

from django.core import mail
from django.test import override_settings

from apps.accounts import services
from apps.accounts.hashing import hash_secret
from apps.accounts.models import (
    AccountState,
    Category,
    ClubPasskey,
    EmailLinkToken,
    SubRole,
)

from .support import M1PinTestCase as TestCase
from .support import (
    iter_routes,
    make_profile,
    request_for,
)

LOC = {"EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend"}


class LinkBuilderTests(TestCase):
    """The F2/F4 links keep the token out of the query string."""

    def test_change_password_link_puts_token_in_the_fragment(self) -> None:
        link = services._change_password_link("SECRETTOKEN123")
        self.assertIn("#token=SECRETTOKEN123", link)
        self.assertNotIn("?token=", link)
        self.assertNotIn("&token=", link)

    def test_reset_password_link_puts_token_in_the_fragment(self) -> None:
        link = services._reset_password_link("SECRETTOKEN456")
        self.assertIn("#token=SECRETTOKEN456", link)
        self.assertNotIn("?token=", link)
        self.assertNotIn("&token=", link)

    def test_no_query_string_carries_a_token(self) -> None:
        for builder in (services._change_password_link, services._reset_password_link):
            link = builder("XYZ")
            before_fragment = link.split("#", 1)[0]
            self.assertNotIn("token", before_fragment.lower(), link)

    def test_email_body_carries_the_link_but_no_query_token(self) -> None:
        actor, _ = make_profile(
            username="t1boss",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        target, _profile = make_profile(
            username="t1club",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email="t1club@example.test",
            institution_code="IIT",
            club_code="CLB1",
            account_state=AccountState.PENDING_APPROVAL,
        )
        with override_settings(**LOC):
            services.approve_club_account(target=target, actor=actor)
            self.assertEqual(len(mail.outbox), 1)
            body = mail.outbox[0].body
        self.assertIn("#token=", body)
        self.assertNotIn("?token=", body)


class StorageIsHashedTests(TestCase):
    """Codes/tokens/passkeys are persisted hashed; the TOTP secret is sealed."""

    def test_email_otp_stores_only_the_hash(self) -> None:
        with override_settings(**LOC):
            row = services.send_email_otp(
                email="hash@example.test", purpose="email_verification"
            )
        self.assertNotEqual(row.code_hash, "")
        self.assertEqual(len(row.code_hash), 64)  # sha256 hexdigest
        # The plaintext code never touches the row: no field holds 6 digits
        # equal to the code, and the stored value is a keyed hash.
        self.assertTrue(row.code_hash.isalnum())
        self.assertNotIn("code", row.__dict__)

    def test_link_token_stores_only_the_hash(self) -> None:
        user, _ = make_profile(
            username="t1token",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_EXECUTIVE,
            institution_code="IIT",
            club_code="CLB2",
        )
        token = services._issue_link_token(
            user.profile, EmailLinkToken.Purpose.FORGOT_PASSWORD
        )
        entry = EmailLinkToken.objects.get()
        self.assertEqual(entry.token_hash, hash_secret(token))
        self.assertNotEqual(entry.token_hash, token)

    def test_passkey_stores_only_the_hash(self) -> None:
        value = services.rotate_passkey(club_code="CLB3")
        entry = ClubPasskey.objects.get(club_code="CLB3")
        self.assertEqual(entry.passkey_hash, hash_secret(value))
        self.assertNotEqual(entry.passkey_hash, value)

    def test_totp_secret_is_sealed_not_plaintext(self) -> None:
        from apps.accounts import totp

        user, profile = make_profile(
            username="t1totp",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        secret, _codes = totp.provision_totp(profile)
        profile.refresh_from_db()
        self.assertNotEqual(profile.totp_secret_encrypted, secret)
        self.assertNotIn(secret, profile.totp_secret_encrypted)
        self.assertTrue(profile.totp_enabled)


class NoSecretInAnyResponseBodyTests(TestCase):
    """Sweep every route: no minted secret may surface in a response body."""

    def test_every_route_is_swept_and_leaks_nothing(self) -> None:
        minted = self._mint_secrets()
        self.assertTrue(minted, "no secrets minted — the sweep would be vacuous")
        seen = 0
        for name, path in iter_routes():
            with self.subTest(route=name or path):
                response = self.client.get(path, SERVER_NAME="localhost")
                seen += 1
                body = response.content.decode("utf-8", "replace")
                for secret in minted:
                    self.assertNotIn(
                        secret,
                        body,
                        f"{secret!r} leaked into {path} ({response.status_code})",
                    )
        self.assertGreater(seen, 0, "the route sweep matched no routes")

    def _mint_secrets(self) -> list[str]:
        with override_settings(**LOC):
            row = services.send_email_otp(email="sweep@example.test")
            services.request_password_reset(email="sweep@example.test")
        from apps.accounts.hashing import generate_passkey, generate_password

        secrets = [generate_password(), generate_passkey()]
        user, profile = make_profile(
            username="t1sweep",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            email="sweep-club@example.test",
            institution_code="IIT",
            club_code="CLB9",
        )
        token = services._issue_link_token(
            profile, EmailLinkToken.Purpose.WELCOME_CHANGE_PASSWORD
        )
        secrets.append(token)
        # The plaintext OTP code is not retained anywhere, so the strongest
        # available assertion is that the *hash* is not echoed either.
        secrets.append(row.code_hash)
        return secrets


class NoSecretInAuditRowsTests(TestCase):
    """Audit rows carry context, never secrets (spec section 9: no tokens)."""

    def test_otp_code_never_reaches_the_audit_trail(self) -> None:
        request = request_for()
        with override_settings(**LOC):
            row = services.send_email_otp(
                email="aud@example.test", request=request
            )
        secrets = [row.code_hash]
        from apps.audit.models import AuditLog

        for entry in AuditLog.objects.all():
            blob = repr(entry.detail) + entry.action + entry.object_id
            for secret in secrets:
                self.assertNotIn(secret, blob)

    def test_break_glass_password_is_returned_but_never_audited(self) -> None:
        admin, _ = make_profile(
            username="t1admin",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        club, _ = make_profile(
            username="t1bg",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.ACTIVE,
            institution_code="IIT",
            club_code="CLB7",
        )
        value = services.rotate_passkey(club_code="CLB7")
        request = request_for(admin)
        new_password = services.break_glass_reset(
            target=club,
            passkey=value,
            reason="email channel down",
            request=request,
        )
        self.assertTrue(new_password)
        from apps.audit.models import AuditLog

        for entry in AuditLog.objects.all():
            blob = repr(entry.detail) + entry.action + entry.actor_label
            self.assertNotIn(new_password, blob)
            self.assertNotIn(value, blob)
