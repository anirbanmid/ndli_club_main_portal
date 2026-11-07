"""H2 pins: password_login enforces the per-account lockout (was dead code)."""

import datetime

from django.contrib.sessions.backends.db import SessionStore
from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from apps.accounts.captcha import CAPTCHA_SESSION_KEY, issue_captcha
from apps.accounts.models import AccountState, Category, SubRole, User
from apps.accounts.services import password_login

LIMIT = 5  # conf.LOGIN_ACCOUNT_LIMIT default


class LoginLockoutTests(TestCase):
    def setUp(self) -> None:
        self.factory = RequestFactory()
        self.req = self.factory.post("/api/v1/accounts/login/")
        self.req.session = SessionStore()
        self.user = User.objects.create(
            username="locky.emp",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            account_state=AccountState.ACTIVE,
            is_active=True,
        )
        self.user.set_password("GoodPass@2026!")
        self.user.save()

    def _attempt(self, password: str):
        issue_captcha(self.req)
        answer = self.req.session[CAPTCHA_SESSION_KEY]["answer"]
        return password_login(
            username="locky.emp",
            password=password,
            captcha=answer,
            request=self.req,
        )

    def test_lockout_after_limit_failures_and_clear_on_success(self) -> None:
        for _ in range(LIMIT):
            with self.assertRaises(AuthenticationFailed):
                self._attempt("wrong-guess")

        # Locked now: even the correct password is refused while it stands.
        with self.assertRaises(PermissionDenied):
            self._attempt("GoodPass@2026!")
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.locked_until)

        # After expiry a real login succeeds and resets the failure counter.
        self.user.locked_until = timezone.now() - datetime.timedelta(seconds=1)
        self.user.save(update_fields=["locked_until"])
        profile = self._attempt("GoodPass@2026!")
        self.assertEqual(profile.username, "locky.emp")
        profile.refresh_from_db()
        self.assertEqual(profile.failed_login_count, 0)
