"""T2 — the email-OTP lifecycle (BRIEF_M1.md §2a / §7 T2).

Pinned: 6-digit · single-use · 10 min TTL · max 5 sends/hour/recipient ·
5 verify attempts then a 15-minute lockout · stored hashed only ·
**email channel only** (there is no SMS path in the identity layer).
"""
from __future__ import annotations

import datetime
import pathlib

from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.exceptions import Throttled, ValidationError

from apps.accounts import conf, services
from apps.accounts.hashing import hash_secret
from apps.accounts.models import EmailOTP

from .support import M1PinTestCase as TestCase

LOC = {"EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend"}


def _codes_in_outbox() -> list[str]:
    """Pull the 6-digit codes the captured emails actually carried."""
    import re

    found: list[str] = []
    for message in mail.outbox:
        found.extend(re.findall(r"\b(\d{6})\b", str(message.body)))
    return found


class OtpIssueTests(TestCase):
    def test_code_is_six_digits(self) -> None:
        with override_settings(**LOC):
            services.send_email_otp(email="a@example.test")
        self.assertEqual(len(_codes_in_outbox()), 1)
        self.assertEqual(len(_codes_in_outbox()[0]), 6)

    def test_code_is_stored_hashed_only(self) -> None:
        with override_settings(**LOC):
            services.send_email_otp(email="b@example.test")
        code = _codes_in_outbox()[0]
        row = EmailOTP.objects.get(recipient_email="b@example.test")
        self.assertEqual(row.code_hash, hash_secret(code))
        self.assertNotEqual(row.code_hash, code)
        for field in row.__dict__.values():
            if isinstance(field, str):
                self.assertNotIn(code, field)

    def test_code_is_emailed_and_the_email_is_the_only_channel(self) -> None:
        with override_settings(**LOC):
            services.send_email_otp(email="c@example.test")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["c@example.test"])

    def test_expiry_default_is_ten_minutes(self) -> None:
        with override_settings(**LOC):
            row = services.send_email_otp(email="d@example.test")
        delta = row.expires_at - row.created_at
        self.assertAlmostEqual(
            delta.total_seconds(), conf.OTP_TTL_SECONDS, delta=2
        )
        self.assertEqual(conf.OTP_TTL_SECONDS, 600)

    def test_send_rate_limit_is_five_per_hour_per_recipient(self) -> None:
        with override_settings(**LOC):
            for _ in range(conf.OTP_MAX_SENDS_PER_HOUR):
                services.send_email_otp(email="e@example.test")
            with self.assertRaises(Throttled):
                services.send_email_otp(email="e@example.test")
        # A different recipient is unaffected.
        with override_settings(**LOC):
            services.send_email_otp(email="other@example.test")

    def test_rate_limit_is_per_purpose(self) -> None:
        with override_settings(**LOC):
            for _ in range(conf.OTP_MAX_SENDS_PER_HOUR):
                services.send_email_otp(email="f@example.test", purpose="one")
            services.send_email_otp(email="f@example.test", purpose="two")


class OtpVerifyTests(TestCase):
    def _issue(self, email: str = "v@example.test") -> str:
        with override_settings(**LOC):
            services.send_email_otp(email=email)
        return _codes_in_outbox()[-1]

    def test_good_code_is_accepted_and_consumed(self) -> None:
        code = self._issue()
        row = services.verify_email_otp(email="v@example.test", code=code)
        self.assertIsNotNone(row.used_at)
        self.assertEqual(EmailOTP.objects.filter(used_at__isnull=True).count(), 0)

    def test_replay_is_rejected(self) -> None:
        code = self._issue()
        services.verify_email_otp(email="v@example.test", code=code)
        with self.assertRaises(ValidationError):
            services.verify_email_otp(email="v@example.test", code=code)

    def test_expired_code_is_rejected(self) -> None:
        code = self._issue()
        EmailOTP.objects.update(
            expires_at=timezone.now() - datetime.timedelta(seconds=1)
        )
        with self.assertRaises(ValidationError):
            services.verify_email_otp(email="v@example.test", code=code)

    def test_wrong_code_is_rejected(self) -> None:
        self._issue()
        with self.assertRaises(ValidationError):
            services.verify_email_otp(email="v@example.test", code="000001")

    def test_five_wrong_attempts_lock_the_code(self) -> None:
        self._issue()
        for _ in range(conf.OTP_MAX_VERIFY_ATTEMPTS - 1):
            with self.assertRaises(ValidationError):
                services.verify_email_otp(email="v@example.test", code="000001")
        # The next wrong attempt trips the lockout.
        with self.assertRaises(ValidationError):
            services.verify_email_otp(email="v@example.test", code="000001")
        row = EmailOTP.objects.get(recipient_email="v@example.test")
        self.assertIsNotNone(row.locked_until)

    def test_locked_code_rejects_even_the_right_value(self) -> None:
        code = self._issue()
        EmailOTP.objects.update(
            locked_until=timezone.now() + datetime.timedelta(minutes=5)
        )
        with self.assertRaises(Throttled):
            services.verify_email_otp(email="v@example.test", code=code)

    def test_lockout_lifts_after_the_window(self) -> None:
        code = self._issue()
        EmailOTP.objects.update(
            locked_until=timezone.now() - datetime.timedelta(seconds=1)
        )
        row = services.verify_email_otp(email="v@example.test", code=code)
        self.assertIsNotNone(row.used_at)

    def test_attempt_limit_is_five(self) -> None:
        self.assertEqual(conf.OTP_MAX_VERIFY_ATTEMPTS, 5)

    def test_unknown_recipient_fails_without_leaking(self) -> None:
        with self.assertRaises(ValidationError):
            services.verify_email_otp(email="nobody@example.test", code="123456")


class OtpChannelIsEmailOnlyTests(TestCase):
    """There is NO SMS/voice delivery path in the identity layer (T2 pin)."""

    IDENTITY_DIRS = ("accounts", "audit", "core")

    def test_identity_modules_never_reference_an_sms_transport(self) -> None:
        root = pathlib.Path(__file__).resolve().parent.parent / "apps"
        offenders: list[str] = []
        for package in self.IDENTITY_DIRS:
            for path in (root / package).glob("*.py"):
                text = path.read_text(encoding="utf-8")
                for needle in ("send_sms", "sms_send", "SMSBackend", "twilio"):
                    if needle in text:
                        offenders.append(f"{path.name}: {needle}")
        self.assertEqual(offenders, [], "identity code touches an SMS path")

    def test_the_otp_service_only_uses_the_email_provider(self) -> None:
        calls: list[str] = []

        class Spy:
            def send(self, message: object) -> None:
                calls.append(message.to)  # type: ignore[attr-defined]

        services.send_email_otp(
            email="spy@example.test", provider=Spy()  # type: ignore[arg-type]
        )
        self.assertEqual(calls, ["spy@example.test"])
        self.assertEqual(len(mail.outbox), 0)

    def test_no_phone_number_is_used_for_delivery(self) -> None:
        from apps.accounts.models import User

        self.assertIn("phone", [f.name for f in User._meta.fields])
        self.assertIn("alt_phone", [f.name for f in User._meta.fields])
        # The phones are contact records: no service reads them to deliver.
        root = pathlib.Path(__file__).resolve().parent.parent / "apps/accounts"
        for path in root.glob("*.py"):
            text = path.read_text(encoding="utf-8")
            self.assertNotIn("send_sms", text)
            self.assertNotIn("phone_otp", text)
