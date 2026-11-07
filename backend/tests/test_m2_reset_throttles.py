"""M2 pins: forgot/reset endpoints are throttled; weak reset passwords die."""

from django.core.cache import cache
from django.test import Client, TestCase, override_settings

from apps.accounts.models import AccountState, Category, SubRole, User


class ResetThrottleTests(TestCase):
    def test_forgot_check_is_throttled_per_ip(self) -> None:
        client = Client()
        payload = {"email": "nobody@example.com", "role": "member"}
        with override_settings(TESTING=False):
            for _ in range(3):
                client.post(
                    "/api/v1/accounts/password/forgot-check/",
                    data=payload,
                    content_type="application/json",
                )
            resp = client.post(
                "/api/v1/accounts/password/forgot-check/",
                data=payload,
                content_type="application/json",
            )
        self.assertEqual(resp.status_code, 429)

    def test_reset_confirm_rejects_weak_password(self) -> None:
        user = User.objects.create(
            username="weak.pw",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            account_state=AccountState.ACTIVE,
        )
        cache.set("password_reset:test-token-1", user.pk, 3600)
        resp = Client().post(
            "/api/v1/accounts/password/reset-confirm/",
            data={"token": "test-token-1", "new_password": "abc"},
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json().get("code"), "weak_password")
        user.refresh_from_db()
        self.assertFalse(user.check_password("abc"))
