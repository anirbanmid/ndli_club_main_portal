"""T4 — IDOR / cross-scope pins (BRIEF_M1.md §7 T4).

Named pins (each one is a separate test so a regression names itself):

* ``EMP03`` never reads ``EMP05`` data  — cross-scope resolves to 404/empty;
* a student never reads another institution's roster;
* a club admin never reads another club's data;
* no niche reaches ``/api/admin/``;
* the ops-only Super Admin is 403 on every business surface;
* anonymous is 401/403 on every non-public route.

M1 scoping operates on ``accounts.User`` rows (the scope keys live on the
profile until M2 introduces the real FKs — ``docs/ASSUMPTIONS.md`` M1-A1).
"""
from __future__ import annotations

from apps.accounts.models import Category, SubRole, User
from apps.accounts.policies import CategoryGate
from apps.core import scoping

from .support import MODULE_CATEGORIES, iter_routes, make_user, request_for
from .support import M1PinTestCase as TestCase
from .test_m1_t3_matrix import module_for


class CrossOfficerPins(TestCase):
    def test_EMP03_never_reads_EMP05_data(self) -> None:
        emp03 = make_user(
            username="EMP03",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="EAST",
        )
        emp05_profile = make_user(
            username="EMP05",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="WEST",
        )
        visible = scoping.scope_clubs(User.objects.all(), emp03)
        self.assertFalse(visible.filter(pk=emp05_profile.pk).exists())
        self.assertTrue(
            scoping.scope_clubs(User.objects.all(), emp03)
            .filter(pk=emp05_profile.pk)
            .count()
            == 0
        )

    def test_EMP03_reads_its_own_zone(self) -> None:
        emp03 = make_user(
            username="EMP03b",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="EAST",
        )
        peer = make_user(
            username="eastpeer",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            zone_code="EAST",
            institution_code="IIT",
            club_code="CLB1",
        )
        self.assertTrue(
            scoping.scope_clubs(User.objects.all(), emp03)
            .filter(pk=peer.pk)
            .exists()
        )

    def test_central_admin_sees_every_zone(self) -> None:
        boss = make_user(
            username="CENTRAL1",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        for zone in ("EAST", "WEST", "NORTH", "SOUTH"):
            target = make_user(
                username=f"z{zone}",
                category=Category.CLUB_ADMIN,
                sub_role=SubRole.CLUB_SECRETARY,
                zone_code=zone,
                institution_code="IIT",
                club_code=f"CLB{zone}",
            )
            self.assertTrue(
                scoping.scope_clubs(User.objects.all(), boss)
                .filter(pk=target.pk)
                .exists()
            )

    def test_regional_officer_never_sees_governance_beyond_its_zone(self) -> None:
        officer = make_user(
            username="EMP07",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="EAST",
        )
        other = make_user(
            username="westofficer",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="WEST",
        )
        visible = scoping.scope_governance(User.objects.all(), officer)
        self.assertFalse(visible.filter(pk=other.pk).exists())


class StudentPins(TestCase):
    def test_student_never_reads_another_institutions_roster(self) -> None:
        student = make_user(
            username="stu1",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            institution_code="IIT",
            club_code="CLB1",
        )
        other = make_user(
            username="stu2",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            institution_code="JU",
            club_code="CLB9",
        )
        visible = scoping.scope_members(User.objects.all(), student)
        self.assertFalse(visible.filter(pk=other.pk).exists())

    def test_student_sees_only_itself(self) -> None:
        profile = student = make_user(
            username="stu3",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            institution_code="IIT",
            club_code="CLB1",
        )
        visible = scoping.scope_members(User.objects.all(), student)
        self.assertEqual(list(visible.values_list("pk", flat=True)), [profile.pk])

    def test_student_never_reaches_the_governance_scope(self) -> None:
        student = make_user(
            username="stu4",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
        )
        self.assertFalse(
            scoping.scope_governance(User.objects.all(), student).exists()
        )


class ClubAdminPins(TestCase):
    def test_club_admin_never_reads_another_clubs_data(self) -> None:
        admin_a = make_user(
            username="clba",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            institution_code="IIT",
            club_code="CLBA",
        )
        admin_b = make_user(
            username="clbb",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            institution_code="IIT",
            club_code="CLBB",
        )
        visible = scoping.scope_clubs(User.objects.all(), admin_a)
        self.assertFalse(visible.filter(pk=admin_b.pk).exists())

    def test_club_admin_never_reaches_the_admin_module(self) -> None:
        admin_a = make_user(
            username="clbc",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            institution_code="IIT",
            club_code="CLBC",
        )
        self.assertFalse(
            CategoryGate("admin").has_permission(request_for(admin_a), None)
        )

    def test_club_admin_never_reaches_governance(self) -> None:
        admin_a = make_user(
            username="clbd",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            institution_code="IIT",
            club_code="CLBD",
        )
        self.assertFalse(
            scoping.scope_governance(User.objects.all(), admin_a).exists()
        )


class ModuleIsolationPins(TestCase):
    def test_no_niche_other_than_admin_reaches_the_admin_module(self) -> None:
        """PLAN invariant I1: cross-niche access is denied by default."""
        for category, sub_roles in (
            (Category.GENERAL_PUBLIC, {SubRole.ANONYMOUS}),
            (Category.CLUB_ADMIN, {SubRole.CLUB_SECRETARY}),
            (Category.STUDENT_MEMBER, {SubRole.STUDENT_MEMBER}),
        ):
            for sub_role in sub_roles:
                user = make_user(
                    username=f"t4_{category}_{sub_role}"[:140],
                    category=category,
                    sub_role=sub_role,
                )
                self.assertFalse(
                    CategoryGate("admin").has_permission(request_for(user), None),
                    f"{category}/{sub_role} reached /api/admin/",
                )

    def test_ops_only_super_admin_is_403_on_every_business_surface(self) -> None:
        """Super Admin (ops) = strictly ops, ZERO business powers (§3b)."""
        ops = make_user(
            username="OPSROOT",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.SUPER_ADMIN_OPS,
        )
        for scope in ("clubs", "members", "governance"):
            helper = {
                "clubs": scoping.scope_clubs,
                "members": scoping.scope_members,
                "governance": scoping.scope_governance,
            }[scope]
            self.assertFalse(
                helper(User.objects.all(), ops).exists(),
                f"ops-only Super Admin saw {scope} data",
            )
        # And the category gate refuses it on both business modules.
        self.assertFalse(CategoryGate("club").has_permission(request_for(ops), None))
        self.assertFalse(CategoryGate("admin").has_permission(request_for(ops), None))


class AnonymousPins(TestCase):
    def test_anonymous_is_denied_on_every_non_public_module(self) -> None:
        anon = request_for()
        for module in MODULE_CATEGORIES:
            if module == "public":
                continue
            self.assertFalse(CategoryGate(module).has_permission(anon, None), module)

    def test_anonymous_gets_no_data_on_non_public_routes(self) -> None:
        """Any non-public route answers 401/403/redirect — never 200 + data."""
        # The admin login/logout pages are the authentication entry point:
        # they are reachable anonymously by definition and carry no data.
        AUTH_ENTRY = {"/admin/login/", "/admin/logout/"}
        non_public = [
            path
            for _n, path in iter_routes()
            if module_for(path) != "public" and path not in AUTH_ENTRY
        ]
        self.assertTrue(non_public, "no non-public routes to probe")
        for path in non_public:
            response = self.client.get(path, SERVER_NAME="localhost")
            with self.subTest(path=path):
                self.assertNotEqual(
                    response.status_code,
                    200,
                    f"{path} served data to an anonymous caller",
                )

    def test_anonymous_scoping_returns_nothing(self) -> None:
        anon = request_for()
        self.assertFalse(scoping.scope_clubs(User.objects.all(), anon).exists())
        self.assertFalse(scoping.scope_members(User.objects.all(), anon).exists())
        self.assertFalse(scoping.scope_governance(User.objects.all(), anon).exists())


class RouteDiscoveryPins(TestCase):
    def test_route_walker_sees_the_urlconf(self) -> None:
        routes = [path for _name, path in iter_routes()]
        self.assertIn("/health/", routes)
        self.assertIn("/health/ready/", routes)

    def test_the_admin_module_is_reachable_only_under_its_prefix(self) -> None:
        admin_routes = [
            path for _n, path in iter_routes() if module_for(path) == "admin"
        ]
        self.assertTrue(admin_routes)
        for path in admin_routes:
            self.assertTrue(path.startswith("/admin/"), path)
