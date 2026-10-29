"""D5 slice 7 pins — the office login gate (owner 2026-10-27).

Employee code + password + captcha — the previous project's office pattern.
The module gate must work with NO mail server running and must not burn email
quota, so this door contains NO email/OTP step at all. The captcha is one-shot
and session-held (P0: nothing forgeable on the client).
"""

from __future__ import annotations

from django.core.management import call_command

from apps.accounts.models import AccountState, Category, SubRole
from apps.core.management.commands.seed_office_demo import demo_password
from tests.support import GOOD_PASSWORD, M1PinTestCase, make_user

CAPTCHA_URL = "/api/v1/accounts/captcha/"
LOGIN_URL = "/api/v1/accounts/login/"
ME_URL = "/api/v1/accounts/me/"
EMPLOYEE_LIST_URL = "/admin/api/v1/employees/"

#: Wire bytes (byte-pinned, F2): a DRF ``ValidationError`` raised with a plain
#: string renders as a BARE top-level list; auth failures render
#: ``{"detail": <string>}``. The client's ``detailMessage`` normalises both.
CAPTCHA_VERDICT = ["The captcha answer is not valid."]
WRONG_PASSWORD_VERDICT = {"detail": "Invalid username or password."}


def _solve(client) -> str:
    """Read the minted challenge from the server session (test-only view)."""
    response = client.get(CAPTCHA_URL)
    assert response.status_code == 200
    return str(client.session["login_captcha"]["answer"])


class CaptchaEndpointTests(M1PinTestCase):
    def test_issues_an_svg_image_with_no_store(self) -> None:
        response = self.client.get(CAPTCHA_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/svg+xml")
        self.assertEqual(response["Cache-Control"], "no-store, max-age=0")
        self.assertIn(b"<svg", response.content)

    def test_the_answer_stays_server_side(self) -> None:
        response = self.client.get(CAPTCHA_URL)
        answer = self.client.session["login_captcha"]["answer"]
        self.assertNotIn(answer.encode("utf-8"), response.content)

    def test_every_issue_rotates_the_challenge(self) -> None:
        first = _solve(self.client)
        second = _solve(self.client)
        self.assertNotEqual(first, second)

    def test_captcha_is_always_mixed_case(self) -> None:
        for _ in range(20):
            code = _solve(self.client)
            self.assertTrue(any(ch.isupper() for ch in code))
            self.assertTrue(any(ch.islower() for ch in code))


class OfficeLoginGateTests(M1PinTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.admin = make_user(
            username="EMP01",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
            password=GOOD_PASSWORD,
        )
        self.member = make_user(
            username="stu01",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            password=GOOD_PASSWORD,
        )

    def test_office_login_marks_the_session_entry_verified(self) -> None:
        """Patch 0016 pin: the office door must unlock the admin gates."""
        captcha = _solve(self.client)
        response = self.client.post(
            LOGIN_URL,
            {"username": "EMP01", "password": GOOD_PASSWORD, "captcha": captcha},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.client.session.get("mfa_verified"))

    def test_admin_desks_load_after_office_login(self) -> None:
        """Regression pin for the owner report 2026-10-27: every admin desk
        answered 'You do not have permission to perform this action.'"""
        captcha = _solve(self.client)
        self.client.post(
            LOGIN_URL,
            {"username": "EMP01", "password": GOOD_PASSWORD, "captcha": captcha},
        )
        desk = self.client.get(EMPLOYEE_LIST_URL)
        self.assertEqual(desk.status_code, 200)

    def test_seed_demo_credentials_work_end_to_end(self) -> None:
        """The seed's OWN credentials must open the gate (deploy-smoke pin:
        guards the docs-vs-seed mismatch behind the owner's first smoke)."""
        call_command("seed_office_demo")
        captcha = _solve(self.client)
        demo = demo_password("Emp01")
        response = self.client.post(
            LOGIN_URL,
            {"username": "EMP01", "password": demo, "captcha": captcha},
        )
        self.assertEqual(response.status_code, 200)
        desk = self.client.get(EMPLOYEE_LIST_URL)
        self.assertEqual(desk.status_code, 200)

    def test_captcha_is_required(self) -> None:
        _solve(self.client)
        response = self.client.post(
            LOGIN_URL, {"username": "EMP01", "password": GOOD_PASSWORD}
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), CAPTCHA_VERDICT)

    def test_wrong_captcha_is_rejected_and_burned(self) -> None:
        _solve(self.client)
        response = self.client.post(
            LOGIN_URL,
            {"username": "EMP01", "password": GOOD_PASSWORD, "captcha": "WRONG1"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), CAPTCHA_VERDICT)
        # One-shot: the challenge row is gone even for the next, right answer.
        self.assertNotIn("login_captcha", self.client.session)

    def test_case_mismatched_captcha_is_rejected_and_burned(self) -> None:
        while True:
            captcha = _solve(self.client)
            if any(ch.isalpha() for ch in captcha):
                break
        response = self.client.post(
            LOGIN_URL,
            {
                "username": "EMP01",
                "password": GOOD_PASSWORD,
                "captcha": captcha.lower(),
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), CAPTCHA_VERDICT)
        self.assertNotIn("login_captcha", self.client.session)

    def test_admin_office_login_opens_an_admin_session(self) -> None:
        captcha = _solve(self.client)
        response = self.client.post(
            LOGIN_URL,
            {"username": "EMP01", "password": GOOD_PASSWORD, "captcha": captcha},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["username"], "EMP01")
        self.assertEqual(body["category"], "iit_kgp_admin")
        # The App.tsx admin gate contract: /me/ must now answer as the admin.
        me = self.client.get(ME_URL)
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["category"], "iit_kgp_admin")

    def test_club_member_login_still_works(self) -> None:
        captcha = _solve(self.client)
        response = self.client.post(
            LOGIN_URL,
            {"username": "stu01", "password": GOOD_PASSWORD, "captcha": captcha},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["category"], "student_member")

    def test_wrong_password_verdict_is_unchanged_and_burns_the_captcha(self) -> None:
        captcha = _solve(self.client)
        response = self.client.post(
            LOGIN_URL,
            {"username": "EMP01", "password": "not-the-password", "captcha": captcha},
        )
        # DRF maps credential failures to 403 on views with no authenticators
        # (pre-existing contract since M5-D1 — byte-pinned here).
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), WRONG_PASSWORD_VERDICT)
        self.assertNotIn("login_captcha", self.client.session)

    def test_pending_approval_member_is_still_blocked(self) -> None:
        make_user(
            username="stu02",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            password=GOOD_PASSWORD,
            account_state=AccountState.PENDING_APPROVAL,
        )
        captcha = _solve(self.client)
        response = self.client.post(
            LOGIN_URL,
            {"username": "stu02", "password": GOOD_PASSWORD, "captcha": captcha},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {"detail": "Account is awaiting approval; you cannot log in yet."},
        )

    def test_inactive_admin_is_still_blocked(self) -> None:
        make_user(
            username="EMP02",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
            password=GOOD_PASSWORD,
            account_state=AccountState.PENDING_APPROVAL,
        )
        captcha = _solve(self.client)
        response = self.client.post(
            LOGIN_URL,
            {"username": "EMP02", "password": GOOD_PASSWORD, "captcha": captcha},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"detail": "Account is not active."})
