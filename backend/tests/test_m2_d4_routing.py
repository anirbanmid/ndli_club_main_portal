"""D4 — routing pins (BRIEF_M2.md §4): OfficerAssignment-backed, F2 flow.

Named pins:
* ``responsible_officer`` resolves from ``OfficerAssignment`` and NOTHING
  else (P4 single source — no zone-guessing fallback);
* assignment windows are honoured (expired/future = ``None`` = "awaiting
  officer assignment", never blocked);
* F2 approval routing is recorded on the lifecycle audit rows;
* the approval zone rule runs over the domain graph (club -> institution ->
  state -> zone) with the documented soft-key fallback, and the graph WINS
  over a stale profile key (the drift verify_domain reports);
* zone rule: Regional Officer = own zone only, Central Admin = all zones.
"""
from __future__ import annotations

from datetime import timedelta

from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from apps.accounts import services
from apps.accounts.models import AccountState, Category, SubRole
from apps.audit.models import AuditLog
from apps.domain import assignments

from .m2_support import assign_officer, build_zone_graph
from .support import GOOD_PASSWORD, make_user
from .support import M1PinTestCase as TestCase

LOC = {"EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend"}


class ResponsibleOfficerTests(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.delhi = self.graph["NORTH"]["state"]
        self.emp01, _ = assign_officer("EMP01", self.delhi)

    def test_routing_resolves_from_the_assignment_table_only(self) -> None:
        self.assertEqual(assignments.officer_username_for_state("DELHI"), "EMP01")
        from apps.accounts.routing import responsible_officer

        self.assertEqual(responsible_officer("DELHI"), "EMP01")

    def test_unassigned_states_resolve_to_none_never_a_guess(self) -> None:
        # SIKKIM exists in the seed with no officer (awaiting assignment).
        from apps.domain.models import State, Zone

        zone = Zone.objects.create(code="EAST", name="East")
        State.objects.create(code="SIKKIM", name="Sikkim", zone=zone)
        self.assertIsNone(assignments.officer_username_for_state("SIKKIM"))
        self.assertIsNone(assignments.officer_username_for_state(""))

    def test_assignment_windows_are_honoured(self) -> None:
        from apps.accounts.routing import responsible_officer
        from apps.domain.models import OfficerAssignment

        OfficerAssignment.objects.all().update(
            to_date=timezone.localdate() - timedelta(days=1)
        )
        self.assertIsNone(responsible_officer("DELHI"), "expired window")
        OfficerAssignment.objects.all().update(
            from_date=timezone.localdate() + timedelta(days=1), to_date=None
        )
        self.assertIsNone(responsible_officer("DELHI"), "future window")

    def test_the_pick_is_deterministic_when_windows_overlap(self) -> None:
        assign_officer(
            "EMP09", self.delhi, from_date=timezone.localdate() - timedelta(days=10)
        )
        self.assertEqual(assignments.officer_username_for_state("DELHI"), "EMP09")
        self.assertTrue(assignments.officer_assignment_for_state("DELHI"))


class F2ApprovalRoutingTests(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        assign_officer("EMP01", self.graph["NORTH"]["state"])

    def test_the_registration_request_lands_on_the_responsible_officer(self) -> None:
        services.create_provisional_account(
            username="d4club",
            password=GOOD_PASSWORD,
            email="d4club@example.test",
            sub_role=SubRole.CLUB_SECRETARY,
            institution_code="INST-DU-001",
            club_code="CLB-DU-CULT",
            state_code="DELHI",
            zone_code="NORTH",
        )
        row = AuditLog.objects.get(action="account.create")
        self.assertEqual(row.detail.get("routed_to"), "EMP01")

    def test_approve_records_the_routing_target_too(self) -> None:
        with override_settings(**LOC):
            boss = make_user(
                username="d4boss",
                category=Category.IIT_KGP_ADMIN,
                sub_role=SubRole.CENTRAL_ADMIN,
            )
            target = make_user(
                username="d4target",
                category=Category.CLUB_ADMIN,
                sub_role=SubRole.CLUB_SECRETARY,
                account_state=AccountState.PENDING_APPROVAL,
                institution_code="INST-DU-001",
                club_code="CLB-DU-CULT",
                state_code="DELHI",
                zone_code="NORTH",
            )
            services.approve_club_account(target=target, actor=boss)
        row = AuditLog.objects.get(action="account.approve")
        self.assertEqual(row.detail.get("routed_to"), "EMP01")


class ZoneRuleOverTheGraphTests(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.ro_west = make_user(
            username="d4emp03",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="WEST",
        )
        self.boss = make_user(
            username="d4central",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )

    def _pending(self, username: str, club_code: str, zone_code: str):
        return make_user(
            username=username,
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.PENDING_APPROVAL,
            club_code=club_code,
            zone_code=zone_code,
        )

    def test_regional_officer_cannot_approve_a_club_outside_its_zone(self) -> None:
        target = self._pending("d4ne", "CLB-AS-CULT", "NORTH_EAST")
        with self.assertRaises(PermissionDenied):
            services.approve_club_account(target=target, actor=self.ro_west)

    def test_regional_officer_approves_inside_its_zone(self) -> None:
        with override_settings(**LOC):
            profile = target = self._pending("d4west", "CLB-MH-TECH", "WEST")
            services.approve_club_account(target=target, actor=self.ro_west)
        profile.refresh_from_db()
        self.assertEqual(profile.account_state, AccountState.ACTIVE)

    def test_central_admin_approves_any_zone(self) -> None:
        with override_settings(**LOC):
            profile = target = self._pending("d4any", "CLB-AS-CULT", "NORTH_EAST")
            services.approve_club_account(target=target, actor=self.boss)
        profile.refresh_from_db()
        self.assertEqual(profile.account_state, AccountState.ACTIVE)

    def test_the_domain_graph_wins_over_a_stale_profile_key(self) -> None:
        # Profile says NORTH but the club lives in WEST -> the graph decides
        # (P4 single source); the stale key is a verify_domain finding.
        profile = target = self._pending("d4drift", "CLB-MH-TECH", "NORTH")
        self.assertEqual(profile.zone_code, "NORTH")
        self.assertEqual(
            assignments.zone_code_of_profile(profile), "WEST", "graph wins"
        )
        # The WEST officer (the true owner) CAN approve...
        with override_settings(**LOC):
            services.approve_club_account(target=target, actor=self.ro_west)
        # ...and a NORTH officer could not have.
        ro_north = make_user(
            username="d4emp01",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="NORTH",
        )
        target2 = self._pending("d4drift2", "CLB-MH-TECH", "NORTH")
        with self.assertRaises(PermissionDenied):
            services.approve_club_account(target=target2, actor=ro_north)
        # The stale key is exactly what verify_domain reports (P4 drift).
        from apps.domain import verify

        self.assertTrue(verify.run_checks().scope_drift)

    def test_welcome_mail_is_the_only_notification_channel(self) -> None:
        with override_settings(**LOC):
            target = self._pending("d4mail", "CLB-MH-TECH", "WEST")
            services.approve_club_account(target=target, actor=self.ro_west)
        self.assertTrue(mail.outbox, "welcome link must be emailed")
        self.assertIsNotNone(target.pk)
