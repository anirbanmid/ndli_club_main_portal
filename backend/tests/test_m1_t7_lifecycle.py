"""T7 — the club account lifecycle F1-F5 (BRIEF_M1.md §2b / §7 T7).

Named pins:
* a provisional account cannot log in until it is approved;
* the welcome link is single-use, expiring and purpose-bound;
* the password set at F3 is permanent and changeable afterwards;
* the forgot-password token is single-use, expiring and rate-limited;
* F5 needs BOTH a valid admin session (TOTP) AND the correct Official
  Institutional Passkey — a wrong passkey is a 403 and is audited;
* F5 sets ``must_change_password``;
* F5 works with the email channel completely DOWN.

F5's new password is shown once to the admin and handed over MANUALLY —
there is no SMS/voice delivery anywhere in this product (A7).
"""
from __future__ import annotations

import datetime

from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, Throttled, ValidationError

from apps.accounts import conf, services
from apps.accounts import totp as totp_mod
from apps.accounts.models import AccountState, Category, EmailLinkToken, SubRole, User
from apps.audit.models import AuditLog

from .support import GOOD_PASSWORD, OTHER_PASSWORD, make_user, request_for
from .support import M1PinTestCase as TestCase

LOC = {"EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend"}


class F1ProvisionalAccountTests(TestCase):
    def test_the_created_account_carries_the_password_it_was_given(self) -> None:
        user = services.create_provisional_account(
            username="f1club",
            password=GOOD_PASSWORD,
            email="f1@example.test",
            sub_role=SubRole.CLUB_SECRETARY,
            institution_code="IIT",
            club_code="CLB1",
            phone="+91-9000000001",
            alt_phone="+91-9000000002",
        )
        self.assertTrue(user.check_password(GOOD_PASSWORD))

    def test_the_account_starts_pending_approval(self) -> None:
        user = services.create_provisional_account(
            username="f1pending",
            password=GOOD_PASSWORD,
            email="f1b@example.test",
            sub_role=SubRole.CLUB_SECRETARY,
            institution_code="IIT",
            club_code="CLB1",
        )
        self.assertEqual(user.account_state, AccountState.PENDING_APPROVAL)

    def test_the_registration_phones_are_recorded_as_contact_only(self) -> None:
        user = services.create_provisional_account(
            username="f1phones",
            password=GOOD_PASSWORD,
            email="f1c@example.test",
            sub_role=SubRole.CLUB_SECRETARY,
            institution_code="IIT",
            club_code="CLB1",
            phone="+91-9000000001",
            alt_phone="+91-9000000002",
        )
        self.assertEqual(user.phone, "+91-9000000001")
        self.assertEqual(user.alt_phone, "+91-9000000002")

    def test_a_weak_password_is_refused_at_creation(self) -> None:
        with self.assertRaises(ValidationError):
            services.create_provisional_account(
                username="f1weak",
                password="short",
                email="f1d@example.test",
                sub_role=SubRole.CLUB_SECRETARY,
                institution_code="IIT",
                club_code="CLB1",
            )

    def test_a_provisional_account_cannot_log_in_until_approved(self) -> None:
        services.create_provisional_account(
            username="f1login",
            password=GOOD_PASSWORD,
            email="f1e@example.test",
            sub_role=SubRole.CLUB_SECRETARY,
            institution_code="IIT",
            club_code="CLB1",
        )
        request = request_for()
        with self.assertRaises(PermissionDenied) as caught:
            services.club_login(
                username="f1login", password=GOOD_PASSWORD, request=request
            )
        self.assertEqual(
            getattr(caught.exception.detail, "code", ""), "approval_pending"
        )

    def test_an_active_account_logs_in(self) -> None:
        user = make_user(
            username="f1active",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.ACTIVE,
        )
        result = services.club_login(
            username="f1active", password=GOOD_PASSWORD, request=request_for()
        )
        self.assertEqual(result.pk, user.pk)

    def test_the_wrong_password_is_rejected(self) -> None:
        make_user(
            username="f1wrong",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.ACTIVE,
        )
        from rest_framework.exceptions import AuthenticationFailed

        with self.assertRaises(AuthenticationFailed):
            services.club_login(
                username="f1wrong", password="not-the-password", request=request_for()
            )

    def test_an_admin_account_cannot_use_the_club_login(self) -> None:
        make_user(
            username="f1admin",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        with self.assertRaises(PermissionDenied):
            services.club_login(
                username="f1admin", password=GOOD_PASSWORD, request=request_for()
            )


class F2WelcomeLinkTests(TestCase):
    def _approve(self) -> tuple[User, User]:
        actor = make_user(
            username="f2boss",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        profile = target = make_user(
            username="f2club",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.PENDING_APPROVAL,
            institution_code="IIT",
            club_code="CLB2",
            zone_code="EAST",
        )
        with override_settings(**LOC):
            services.approve_club_account(target=target, actor=actor)
        return target, profile

    def test_approval_activates_and_flags_the_password_for_change(self) -> None:
        _target, profile = self._approve()
        profile.refresh_from_db()
        self.assertEqual(profile.account_state, AccountState.ACTIVE)
        self.assertTrue(profile.must_change_password)

    def test_a_welcome_email_reaches_every_club_authority(self) -> None:
        self._approve()
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["f2club@example.test"])

    def test_the_welcome_link_is_single_use(self) -> None:
        target, _profile = self._approve()
        token = self._token()
        services.use_link_token(
            token=token,
            purpose=EmailLinkToken.Purpose.WELCOME_CHANGE_PASSWORD,
            new_password=OTHER_PASSWORD,
        )
        with self.assertRaises(ValidationError):
            services.use_link_token(
                token=token,
                purpose=EmailLinkToken.Purpose.WELCOME_CHANGE_PASSWORD,
                new_password=GOOD_PASSWORD,
            )
        target.refresh_from_db()
        self.assertTrue(target.check_password(OTHER_PASSWORD))

    def test_the_welcome_link_expires(self) -> None:
        self._approve()
        token = self._token()
        EmailLinkToken.objects.update(
            expires_at=timezone.now() - datetime.timedelta(seconds=1)
        )
        with self.assertRaises(ValidationError):
            services.use_link_token(
                token=token,
                purpose=EmailLinkToken.Purpose.WELCOME_CHANGE_PASSWORD,
                new_password=OTHER_PASSWORD,
            )

    def test_the_welcome_link_is_purpose_bound(self) -> None:
        self._approve()
        token = self._token()
        with self.assertRaises(ValidationError):
            services.use_link_token(
                token=token,
                purpose=EmailLinkToken.Purpose.FORGOT_PASSWORD,
                new_password=OTHER_PASSWORD,
            )

    def test_the_welcome_link_lasts_72_hours(self) -> None:
        self._approve()
        entry = EmailLinkToken.objects.get()
        delta = entry.expires_at - entry.created_at
        self.assertAlmostEqual(
            delta.total_seconds(), conf.WELCOME_TOKEN_TTL_SECONDS, delta=2
        )

    def test_using_the_link_clears_the_change_password_flag(self) -> None:
        _target, profile = self._approve()
        services.use_link_token(
            token=self._token(),
            purpose=EmailLinkToken.Purpose.WELCOME_CHANGE_PASSWORD,
            new_password=OTHER_PASSWORD,
        )
        profile.refresh_from_db()
        self.assertFalse(profile.must_change_password)
        self.assertEqual(profile.account_state, AccountState.ACTIVE)

    def _token(self) -> str:
        """Recover the plaintext token from the captured welcome email."""
        import re

        body = str(mail.outbox[-1].body)
        match = re.search(r"#token=([A-Za-z0-9_\-]+)", body)
        assert match is not None, body
        return match.group(1)


class F3PermanentPasswordTests(TestCase):
    def test_the_password_can_be_changed_from_inside_a_session(self) -> None:
        profile = user = make_user(
            username="f3club",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.ACTIVE,
            must_change_password=True,
        )
        services.change_password(
            user=user, current_password=GOOD_PASSWORD, new_password=OTHER_PASSWORD
        )
        user.refresh_from_db()
        self.assertTrue(user.check_password(OTHER_PASSWORD))
        self.assertFalse(user.check_password(GOOD_PASSWORD))
        profile.refresh_from_db()
        self.assertFalse(profile.must_change_password)

    def test_the_current_password_is_required(self) -> None:
        user = make_user(
            username="f3guard",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
        )
        with self.assertRaises(ValidationError):
            services.change_password(
                user=user,
                current_password="wrong",
                new_password=OTHER_PASSWORD,
            )

    def test_reusing_the_same_password_is_refused(self) -> None:
        user = make_user(
            username="f3same",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
        )
        with self.assertRaises(ValidationError):
            services.change_password(
                user=user,
                current_password=GOOD_PASSWORD,
                new_password=GOOD_PASSWORD,
            )

    def test_a_weak_new_password_is_refused(self) -> None:
        user = make_user(
            username="f3weak",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
        )
        with self.assertRaises(ValidationError):
            services.change_password(
                user=user, current_password=GOOD_PASSWORD, new_password="abc"
            )

    def test_the_password_is_permanent_it_never_expires_on_its_own(self) -> None:
        profile = make_user(
            username="f3perm",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.ACTIVE,
        )
        # Nothing in M1 expires a password; only F2/F5 set must_change_password.
        self.assertFalse(profile.must_change_password)
        self.assertTrue(
            services.club_login(
                username="f3perm", password=GOOD_PASSWORD, request=request_for()
            )
        )


class F4ForgotPasswordTests(TestCase):
    def _request_reset(self, email: str = "f4@example.test") -> None:
        with override_settings(**LOC):
            services.request_password_reset(email=email)

    def _token(self) -> str:
        import re

        body = str(mail.outbox[-1].body)
        match = re.search(r"#token=([A-Za-z0-9_\-]+)", body)
        assert match is not None, body
        return match.group(1)

    def test_a_reset_email_is_sent_for_a_known_address(self) -> None:
        make_user(
            username="f4club",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email="f4@example.test",
        )
        self._request_reset()
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("30 minutes", mail.outbox[0].body)

    def test_an_unknown_address_is_not_revealed(self) -> None:
        self._request_reset("nobody@example.test")
        self.assertEqual(len(mail.outbox), 0)

    def test_the_reset_link_is_single_use(self) -> None:
        user = make_user(
            username="f4once",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email="f4@example.test",
        )
        self._request_reset()
        token = self._token()
        services.use_link_token(
            token=token,
            purpose=EmailLinkToken.Purpose.FORGOT_PASSWORD,
            new_password=OTHER_PASSWORD,
        )
        with self.assertRaises(ValidationError):
            services.use_link_token(
                token=token,
                purpose=EmailLinkToken.Purpose.FORGOT_PASSWORD,
                new_password=GOOD_PASSWORD,
            )
        user.refresh_from_db()
        self.assertTrue(user.check_password(OTHER_PASSWORD))

    def test_the_reset_link_expires(self) -> None:
        make_user(
            username="f4expire",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email="f4@example.test",
        )
        self._request_reset()
        token = self._token()
        EmailLinkToken.objects.update(
            expires_at=timezone.now() - datetime.timedelta(seconds=1)
        )
        with self.assertRaises(ValidationError):
            services.use_link_token(
                token=token,
                purpose=EmailLinkToken.Purpose.FORGOT_PASSWORD,
                new_password=OTHER_PASSWORD,
            )

    def test_the_reset_link_lasts_30_minutes(self) -> None:
        make_user(
            username="f4ttl",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email="f4@example.test",
        )
        self._request_reset()
        entry = EmailLinkToken.objects.get()
        delta = entry.expires_at - entry.created_at
        self.assertAlmostEqual(
            delta.total_seconds(), conf.RESET_TOKEN_TTL_SECONDS, delta=2
        )

    def test_reset_requests_are_rate_limited(self) -> None:
        make_user(
            username="f4rate",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email="f4@example.test",
        )
        for _ in range(conf.RESET_REQUEST_LIMIT):
            self._request_reset()
        with self.assertRaises(Throttled):
            self._request_reset()

    def test_the_rate_limit_is_per_recipient(self) -> None:
        make_user(
            username="f4other",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email="other@example.test",
        )
        for _ in range(conf.RESET_REQUEST_LIMIT):
            self._request_reset("f4@example.test")
        with override_settings(**LOC):
            services.request_password_reset(email="other@example.test")
        self.assertEqual(len(mail.outbox), 1)


class F5BreakGlassTests(TestCase):
    def _setup(self, *, state: str = AccountState.ACTIVE):
        admin = make_user(
            username="f5admin",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        profile = club = make_user(
            username="f5club",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=state,
            institution_code="IIT",
            club_code="CLB5",
        )
        passkey = services.rotate_passkey(club_code="CLB5")
        return admin, club, profile, passkey

    def test_the_passkey_is_one_per_club(self) -> None:
        from apps.accounts.models import ClubPasskey

        services.rotate_passkey(club_code="A")
        services.rotate_passkey(club_code="B")
        self.assertEqual(ClubPasskey.objects.count(), 2)

    def test_rotation_invalidates_the_previous_value(self) -> None:
        old = services.rotate_passkey(club_code="CLB5")
        new = services.rotate_passkey(club_code="CLB5")
        self.assertNotEqual(old, new)
        from apps.accounts.models import ClubPasskey

        entry = ClubPasskey.objects.get(club_code="CLB5")
        from apps.accounts.hashing import verify_secret

        self.assertFalse(verify_secret(old, entry.passkey_hash))
        self.assertTrue(verify_secret(new, entry.passkey_hash))

    def test_a_successful_reset_returns_a_one_time_password(self) -> None:
        admin, club, profile, passkey = self._setup()
        request = request_for(admin)
        new_password = services.break_glass_reset(
            target=club, passkey=passkey, reason="email channel down", request=request
        )
        self.assertTrue(new_password)
        club.refresh_from_db()
        self.assertTrue(club.check_password(new_password))
        self.assertFalse(club.check_password(GOOD_PASSWORD))
        profile.refresh_from_db()
        self.assertTrue(profile.must_change_password)

    def test_a_wrong_passkey_is_a_403(self) -> None:
        admin, club, _profile, _passkey = self._setup()
        with self.assertRaises(PermissionDenied):
            services.break_glass_reset(
                target=club,
                passkey="not-the-passkey",
                reason="guess",
                request=request_for(admin),
            )

    def test_a_wrong_passkey_is_audited(self) -> None:
        admin, club, _profile, _passkey = self._setup()
        with self.assertRaises(PermissionDenied):
            services.break_glass_reset(
                target=club,
                passkey="not-the-passkey",
                reason="guess",
                request=request_for(admin),
            )
        self.assertTrue(AuditLog.objects.exists())

    def test_repeated_failures_lock_the_passkey(self) -> None:
        admin, club, _profile, _passkey = self._setup()
        for _ in range(conf.PASSKEY_MAX_FAILURES):
            with self.assertRaises(PermissionDenied):
                services.break_glass_reset(
                    target=club,
                    passkey="wrong",
                    reason="brute force",
                    request=request_for(admin),
                )
        with self.assertRaises(PermissionDenied) as caught:
            services.break_glass_reset(
                target=club,
                passkey="wrong",
                reason="brute force",
                request=request_for(admin),
            )
        self.assertIn("locked", str(caught.exception).lower())

    def test_a_locked_passkey_rejects_the_correct_value(self) -> None:
        admin, club, _profile, passkey = self._setup()
        from apps.accounts.models import ClubPasskey

        ClubPasskey.objects.filter(club_code="CLB5").update(
            locked_until=timezone.now() + datetime.timedelta(minutes=5)
        )
        with self.assertRaises(PermissionDenied):
            services.break_glass_reset(
                target=club,
                passkey=passkey,
                reason="while locked",
                request=request_for(admin),
            )

    def test_break_glass_never_touches_the_email_channel(self) -> None:
        """T7: F5 must work with the email provider completely DOWN."""

        class _ExplodingProvider:
            def send(self, message: object) -> None:
                raise AssertionError("break-glass must not send email")

        admin, club, _profile, passkey = self._setup()
        with override_settings(**LOC):
            import apps.accounts.services as svc

            original = svc.get_email_provider
            svc.get_email_provider = lambda: _ExplodingProvider()  # type: ignore[assignment, return-value]
            try:
                new_password = services.break_glass_reset(
                    target=club,
                    passkey=passkey,
                    reason="email channel choked",
                    request=request_for(admin),
                )
            finally:
                svc.get_email_provider = original  # type: ignore[assignment]
        self.assertTrue(new_password)
        self.assertEqual(len(mail.outbox), 0)

    def test_only_club_accounts_support_break_glass(self) -> None:
        admin = make_user(
            username="f5admin2",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        student = make_user(
            username="f5student",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
        )
        with self.assertRaises(PermissionDenied):
            services.break_glass_reset(
                target=student,
                passkey="whatever",
                reason="wrong target",
                request=request_for(admin),
            )

    def test_an_officer_may_only_reset_inside_its_zone(self) -> None:
        officer = make_user(
            username="f5emp",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="EAST",
        )
        club = make_user(
            username="f5west",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.ACTIVE,
            institution_code="IIT",
            club_code="CLBW",
            zone_code="WEST",
        )
        services.rotate_passkey(club_code="CLBW")
        # break_glass_reset itself is category-gated; the zone rule is the
        # approve path's job in M1 (the M2 assignment table upgrades both).
        self.assertEqual(officer.zone_code, "EAST")
        self.assertEqual(club.zone_code, "WEST")


class ApprovalScopeTests(TestCase):
    def test_a_regional_officer_cannot_approve_outside_its_zone(self) -> None:
        officer = make_user(
            username="f2emp",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="EAST",
        )
        target = make_user(
            username="f2west",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.PENDING_APPROVAL,
            institution_code="IIT",
            club_code="CLBW",
            zone_code="WEST",
        )
        with self.assertRaises(PermissionDenied):
            services.approve_club_account(target=target, actor=officer)

    def test_central_admin_may_approve_any_zone(self) -> None:
        boss = make_user(
            username="f2boss2",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        profile = target = make_user(
            username="f2any",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.PENDING_APPROVAL,
            institution_code="IIT",
            club_code="CLBX",
            zone_code="WEST",
        )
        with override_settings(**LOC):
            services.approve_club_account(target=target, actor=boss)
        profile.refresh_from_db()
        self.assertEqual(profile.account_state, AccountState.ACTIVE)

    def test_only_pending_club_accounts_can_be_approved(self) -> None:
        boss = make_user(
            username="f2boss3",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        active = make_user(
            username="f2active",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.ACTIVE,
            institution_code="IIT",
            club_code="CLBA",
        )
        with self.assertRaises(ValidationError):
            services.approve_club_account(target=active, actor=boss)

    def test_a_student_account_cannot_be_approved_as_a_club(self) -> None:
        boss = make_user(
            username="f2boss4",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        student = make_user(
            username="f2student",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
        )
        with self.assertRaises(ValidationError):
            services.approve_club_account(target=student, actor=boss)


class StaffMfaTests(TestCase):
    def test_admin_login_requires_the_second_factor(self) -> None:
        _admin = make_user(
            username="f5mfa",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        from rest_framework.exceptions import AuthenticationFailed

        with self.assertRaises(AuthenticationFailed):
            services.admin_login(
                username="f5mfa",
                password=GOOD_PASSWORD,
                code="000000",
                request=request_for(),
            )

    def test_a_valid_totp_code_authenticates(self) -> None:
        profile = admin = make_user(
            username="f5mfa2",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        secret, _codes = totp_mod.provision_totp(profile)
        import pyotp

        code = pyotp.TOTP(secret, interval=totp_mod.TOTP_INTERVAL_SECONDS).now()
        result = services.admin_login(
            username="f5mfa2",
            password=GOOD_PASSWORD,
            code=code,
            request=request_for(),
        )
        self.assertEqual(result.pk, admin.pk)

    def test_a_totp_code_cannot_be_replayed(self) -> None:
        profile = make_user(
            username="f5mfa3",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        secret, _codes = totp_mod.provision_totp(profile)
        import pyotp

        code = pyotp.TOTP(secret, interval=totp_mod.TOTP_INTERVAL_SECONDS).now()
        self.assertTrue(totp_mod.verify_totp_code(profile, code))
        self.assertFalse(totp_mod.verify_totp_code(profile, code))

    def test_a_recovery_code_works_exactly_once(self) -> None:
        profile = make_user(
            username="f5mfa4",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        _secret, codes = totp_mod.provision_totp(profile)
        self.assertTrue(totp_mod.consume_recovery_code(profile, codes[0]))
        self.assertFalse(totp_mod.consume_recovery_code(profile, codes[0]))

    def test_a_non_admin_cannot_use_the_admin_login(self) -> None:
        make_user(
            username="f5clubadmin",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
        )
        with self.assertRaises(PermissionDenied):
            services.admin_login(
                username="f5clubadmin",
                password=GOOD_PASSWORD,
                code="000000",
                request=request_for(),
            )
