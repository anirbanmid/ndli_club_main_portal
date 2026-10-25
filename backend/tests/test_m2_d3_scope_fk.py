"""D3 — scope FK pins (BRIEF_M2.md §4): join-based scoping, M1 semantics kept.

Named pins (the M1 T3/T4 suite running UNCHANGED is the other half of this
gate — it proves the FK swap kept the User semantics byte-for-byte):

* ``EMP03`` never reads ``EMP05`` data — now over the real joins
  (club -> institution -> state -> zone);
* a club admin never reads another club's rows through the same joins;
* ``ObjectScope`` keeps its 404 semantics on domain objects;
* the scope registry fails CLOSED for unscoped models;
* the Profile code-string compat surface behaves exactly like M1.
"""
from __future__ import annotations

from django.test import RequestFactory
from rest_framework.exceptions import NotFound

from apps.accounts.models import Category, SubRole, User
from apps.accounts.policies import ObjectScope
from apps.audit.models import AuditLog
from apps.core import scoping
from apps.domain.models import Club, Membership

from .m2_support import add_membership, build_zone_graph
from .support import M1PinTestCase as TestCase
from .support import attach_duty, ensure_state, make_user


class JoinScopingPins(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.west_club = self.graph["WEST"]["club"]
        self.ne_club = self.graph["NORTH_EAST"]["club"]
        self.north_club = self.graph["NORTH"]["club"]
        self.emp03 = make_user(
            username="EMP03",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="WEST",
        )
        self.emp05 = make_user(
            username="EMP05",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="NORTH_EAST",
        )
        # Duty lives in OfficerAssignment (client change 2026-10-25).
        attach_duty(self.emp03, "MAHARASHTRA")
        attach_duty(self.emp05, "ASSAM")

    def test_EMP03_never_reads_EMP05_clubs_over_the_joins(self) -> None:
        visible = scoping.scope_clubs(Club.objects.all(), self.emp03)
        codes = set(visible.values_list("code", flat=True))
        self.assertEqual(codes, {"CLB-MH-TECH"})
        self.assertNotIn("CLB-AS-CULT", codes)

    def test_EMP03_never_reads_EMP05_memberships_over_the_joins(self) -> None:
        west_user = make_user(
            username="weststu",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
        )
        ne_user = make_user(
            username="nestu",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
        )
        add_membership(west_user, self.west_club)
        add_membership(ne_user, self.ne_club)
        visible = scoping.scope_members(Membership.objects.all(), self.emp03)
        self.assertEqual(
            set(visible.values_list("club__code", flat=True)), {"CLB-MH-TECH"}
        )
        self.assertFalse(visible.filter(user=ne_user).exists())

    def test_club_admin_scoping_stays_inside_its_club_over_the_joins(self) -> None:
        admin_a = make_user(
            username="d3admina",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            institution_code="INST-DU-001",
            club_code="CLB-DU-CULT",
            state_code="DELHI",
            zone_code="NORTH",
        )
        admin_b = make_user(
            username="d3adminb",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            institution_code="INST-DU-001",
            club_code="CLB-DU-TECH",
            state_code="DELHI",
            zone_code="NORTH",
        )
        club_a = self.north_club
        club_b = Club.objects.create(
            code="CLB-DU-TECH",
            institution=self.graph["NORTH"]["institution"],
            name="Sample Technology Club Delhi (M2 pin)",
        )
        visible = scoping.scope_clubs(Club.objects.all(), admin_a)
        self.assertIn(club_a.pk, set(visible.values_list("pk", flat=True)))
        self.assertNotIn(club_b.pk, set(visible.values_list("pk", flat=True)))
        self.assertFalse(scoping.scope_members(User.objects.all(), admin_a)
                         .filter(pk=admin_b.pk).exists())

    def test_central_admin_sees_all_zones_over_the_joins(self) -> None:
        boss = make_user(
            username="d3boss",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        visible = scoping.scope_clubs(Club.objects.all(), boss)
        self.assertEqual(visible.count(), 3)

    def test_ops_only_super_admin_sees_no_domain_rows(self) -> None:
        ops = make_user(
            username="d3ops",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.SUPER_ADMIN_OPS,
        )
        for queryset in (Club.objects.all(), Membership.objects.all()):
            self.assertFalse(scoping.scope_clubs(queryset, ops).exists())
            self.assertFalse(scoping.scope_members(queryset, ops).exists())
            self.assertFalse(scoping.scope_governance(queryset, ops).exists())

    def test_object_scope_keeps_404_semantics_on_domain_objects(self) -> None:
        request = RequestFactory().get("/api/v1/test/")
        request.user = self.emp03  # type: ignore[assignment]
        self.assertTrue(
            ObjectScope("clubs").has_object_permission(request, None, self.west_club)
        )
        with self.assertRaises(NotFound):
            ObjectScope("clubs").has_object_permission(request, None, self.ne_club)

    def test_unscoped_models_fail_closed(self) -> None:
        # AuditLog declares no SCOPE_LOOKUPS -> deny by default, never "all".
        queryset = AuditLog.objects.all()
        self.assertFalse(scoping.scope_clubs(queryset, self.emp03).exists())
        self.assertFalse(scoping.scope_members(queryset, self.emp03).exists())
        self.assertFalse(scoping.scope_governance(queryset, self.emp03).exists())

    def test_the_profile_code_string_surface_is_m1_compatible(self) -> None:
        # Same construction M1 tests use; the property kwargs must survive
        # the FK swap (regression pin for the compat layer).
        profile = user = make_user(
            username="d3compat",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            institution_code="IIT",
            club_code="CLB1",
            state_code="",
            zone_code="EAST",
        )
        self.assertEqual(profile.zone_code, "EAST")
        self.assertEqual(profile.institution_code, "IIT")
        self.assertEqual(profile.state_code, "")
        profile.refresh_from_db()
        self.assertEqual(profile.club_code, "CLB1")
        self.assertEqual(profile.zone_id, "EAST")
        other_user = make_user(
            username="d3compat2",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="EAST",
        )
        visible = scoping.scope_governance(User.objects.all(), user)
        self.assertFalse(visible.exists(), "club admins never reach governance")

        # Client change (2026-10-25): duty is a SET of States/UTs held in
        # OfficerAssignment, so visibility follows the assignment table and
        # NOT the user's single zone_code. A profile with NO state is not
        # state-routable and is therefore outside every officer's scope
        # (manage.py verify_domain reports such rows as drift).
        state = ensure_state("EAST", "EAST")
        attach_duty(other_user, state.code)
        officer_view = scoping.scope_clubs(User.objects.all(), other_user)
        self.assertFalse(officer_view.filter(pk=profile.pk).exists())

        # ...whereas a profile that IS in an assigned state is visible.
        peer = make_user(
            username="d3peer",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            institution_code="IIT",
            club_code="CLB1",
            state_code=state.code,
        )
        self.assertTrue(officer_view.filter(pk=peer.pk).exists())
        self.assertIsNotNone(user.pk)
