"""T3 — the category/sub-role access matrix (BRIEF_M1.md §7 T3).

``tests/test_m1_t3_matrix.py`` (this file) is referenced by
``apps/accounts/policies.py``: it fails the build when authorization logic
is scattered through views instead of the one policy module, and when an
endpoint is missing from the route matrix.

Pinned here:
  * ``DenyAll`` — the fail-closed DRF default;
  * ``CategoryGate`` — every (module × category × sub-role) cell decided;
  * the route table — every route is accounted for, so a new endpoint
    cannot arrive without a matrix entry;
  * no scattered ``if request.user…`` authorization in view modules.
"""
from __future__ import annotations

import pathlib

from django.test import RequestFactory
from rest_framework.exceptions import NotFound

from apps.accounts.models import AccountState, Category, SubRole
from apps.accounts.policies import CategoryGate, DenyAll, ObjectScope

from .support import (
    CATEGORY_SUB_ROLES,
    GOOD_PASSWORD,
    MODULE_CATEGORIES,
    iter_routes,
    make_user,
)
from .support import M1PinTestCase as TestCase

VIEW_DIRS = (
    "accounts",
    "audit",
    "core",
    "institutions",
    "clubs",
    "members",
    "activities",
    "certificates",
    "analytics_reports",
    "sharing",
    "succession",
    "governance",
    "grievances",
    "notifications",
    "public_api",
)


def _request(user: object = None, *, mfa: bool = False) -> object:
    request = RequestFactory().get("/api/v1/test/")
    request.user = user  # type: ignore[assignment]
    request.session = {"mfa_verified": True} if mfa else {}  # type: ignore[assignment]
    return request


#: Routes are matched by PREFIX: everything under ``/admin/`` belongs to the
#: admin module, so sub-routes do not each need their own row.
ENDPOINT_MATRIX: dict[str, str] = {
    "/health/": "public",
    "/health/ready/": "public",
    "/api/schema/": "public",
    "/api/docs/": "public",
    "/admin/": "admin",
}


def module_for(path: str) -> str | None:
    """The module namespace that owns ``path``, or ``None`` when unmapped.

    Longest prefix wins. An unmapped route is a build failure: add it to
    ``ENDPOINT_MATRIX`` (and a T3 cell) before it ships.
    """
    best = ""
    owner: str | None = None
    for prefix, module in ENDPOINT_MATRIX.items():
        if path.startswith(prefix) and len(prefix) > len(best):
            best, owner = prefix, module
    return owner


class DenyAllIsFailClosedTests(TestCase):
    def test_deny_all_rejects_authenticated_and_anonymous(self) -> None:
        user = make_user(
            username="t3any",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        self.assertFalse(DenyAll().has_permission(_request(user), None))
        self.assertFalse(DenyAll().has_permission(_request(), None))


class CategoryGateMatrixTests(TestCase):
    """Every (module, category, sub-role) cell is decided by the gate."""

    def test_module_membership_matrix(self) -> None:
        for module, allowed in MODULE_CATEGORIES.items():
            for category in Category.values:
                for sub_role in CATEGORY_SUB_ROLES[category]:
                    user = make_user(
                        username=f"t3_{module}_{category}_{sub_role}".replace(
                            "-", "_"
                        )[:140],
                        category=category,
                        sub_role=sub_role,
                    )
                    gate = CategoryGate(module)
                    with self.subTest(module=module, category=category, role=sub_role):
                        expected = category in allowed
                        self.assertEqual(
                            gate.has_permission(
                                _request(user, mfa=True), None
                            ),
                            expected,
                            f"{category}/{sub_role} vs module {module!r}",
                        )

    def test_sub_role_narrowing_restricts_inside_the_module(self) -> None:
        """A gate naming sub-roles admits only those roles."""
        user = make_user(
            username="t3exec",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_EXECUTIVE,
        )
        self.assertTrue(
            CategoryGate("club", {SubRole.CLUB_SECRETARY}).has_permission(
                _request(user), None
            )
            is False
        )
        self.assertTrue(
            CategoryGate("club", {SubRole.CLUB_EXECUTIVE}).has_permission(
                _request(user), None
            )
        )

    def test_general_public_never_enters_club_or_admin(self) -> None:
        user = make_user(
            username="t3public",
            category=Category.GENERAL_PUBLIC,
            sub_role=SubRole.ANONYMOUS,
        )
        for module in ("club", "admin"):
            self.assertFalse(CategoryGate(module).has_permission(_request(user), None))

    def test_each_category_stays_inside_its_own_niche(self) -> None:
        """PLAN invariant I1: a category never enters another niche's module.

        ``public`` is the shared landing page. ``club`` is the Club Admin /
        Student Member niche. ``admin`` is the IIT Kgp Admin niche — the ONE
        cross-niche door (I2). So no category belongs to two business
        modules at once.
        """
        business = {
            module: allowed
            for module, allowed in MODULE_CATEGORIES.items()
            if module != "public"
        }
        for category in Category.values:
            homes = [m for m, allowed in business.items() if category in allowed]
            self.assertLessEqual(
                len(homes),
                1,
                f"{category} is admitted to {homes} — a category must occupy "
                "exactly one niche",
            )
        self.assertEqual(
            business["admin"],
            frozenset({Category.IIT_KGP_ADMIN}),
            "the admin module must be IIT Kgp Admin only",
        )

    def test_pending_approval_account_is_denied(self) -> None:
        user = make_user(
            username="t3pending",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.PENDING_APPROVAL,
        )
        self.assertFalse(CategoryGate("club").has_permission(_request(user), None))

    def test_must_change_password_blocks_everything_but_the_change_route(self) -> None:
        user = make_user(
            username="t3fresh",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            must_change_password=True,
        )
        self.assertFalse(CategoryGate("club").has_permission(_request(user), None))
        self.assertTrue(
            CategoryGate("club", require_fresh_password=False).has_permission(
                _request(user), None
            )
        )

    def test_admin_module_requires_the_second_factor(self) -> None:
        user = make_user(
            username="t3mfa",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        self.assertFalse(CategoryGate("admin").has_permission(_request(user), None))
        request = _request(user)
        request.session = {"mfa_verified": True}  # type: ignore[attr-defined]
        self.assertTrue(CategoryGate("admin").has_permission(request, None))

    def test_unknown_module_namespace_is_rejected_early(self) -> None:
        with self.assertRaises(ValueError):
            CategoryGate("nope")

    def test_a_profileless_user_is_denied(self) -> None:
        from django.contrib.auth import get_user_model

        bare = get_user_model().objects.create_user(
            username="t3bare", password=GOOD_PASSWORD
        )
        for module in MODULE_CATEGORIES:
            gate = CategoryGate(module)
            allowed = gate.has_permission(_request(bare), None)
            if module == "public":
                # Module 1 is the shared landing page: open to everyone.
                self.assertTrue(allowed, "public must stay open")
            else:
                self.assertFalse(allowed, f"a profile-less user entered {module}")


class ObjectScopeMatrixTests(TestCase):
    def test_unknown_scope_name_is_rejected_early(self) -> None:
        with self.assertRaises(ValueError):
            ObjectScope("nowhere")

    def test_out_of_scope_object_raises_not_found(self) -> None:

        emp03 = make_user(
            username="t3emp03",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="EAST",
        )
        target = make_user(
            username="t3emp05",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="WEST",
        )
        request = _request(emp03)
        with self.assertRaises(NotFound):
            ObjectScope("clubs").has_object_permission(request, None, target)

    def test_in_scope_object_passes(self) -> None:
        emp03 = make_user(
            username="t3emp03b",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="EAST",
        )
        target = make_user(
            username="t3peer",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            zone_code="EAST",
            institution_code="IIT",
            club_code="CLB1",
        )
        self.assertTrue(
            ObjectScope("clubs").has_object_permission(_request(emp03), None, target)
        )


class RouteMatrixTests(TestCase):
    """Every route in the URLconf must be owned by a module in the matrix."""

    def test_no_route_is_missing_from_the_matrix(self) -> None:
        seen: set[str] = set()
        for _name, path in iter_routes():
            seen.add(path)
            self.assertIsNotNone(
                module_for(path),
                f"route {path} is not owned by ENDPOINT_MATRIX — add a prefix "
                "entry (and a T3 cell) before it ships",
            )
        self.assertTrue(seen, "no routes discovered — the check is vacuous")

    def test_every_matrix_entry_declares_a_known_module(self) -> None:
        for path, module in ENDPOINT_MATRIX.items():
            self.assertIn(module, MODULE_CATEGORIES, path)

    def test_public_routes_are_the_only_open_ones(self) -> None:
        public = {p for p, m in ENDPOINT_MATRIX.items() if m == "public"}
        self.assertIn("/health/", public)
        self.assertIn("/health/ready/", public)
        self.assertNotIn("/admin/", public)

    def test_the_admin_prefix_is_the_only_admin_door(self) -> None:
        admin_routes = [
            path for _n, path in iter_routes() if module_for(path) == "admin"
        ]
        self.assertTrue(admin_routes)
        for path in admin_routes:
            self.assertTrue(path.startswith("/admin/"), path)


class NoScatteredAuthorizationTests(TestCase):
    """Views must not hand-roll authorization; the policy module owns it."""

    def test_view_modules_do_not_branch_on_request_user(self) -> None:
        root = pathlib.Path(__file__).resolve().parent.parent / "apps"
        offenders: list[str] = []
        for package in VIEW_DIRS:
            for path in (root / package).glob("views.py"):
                for lineno, line in enumerate(
                    path.read_text(encoding="utf-8").splitlines(), 1
                ):
                    stripped = line.strip()
                    if stripped.startswith("#"):
                        continue
                    if "request.user" in line and any(
                        kw in line for kw in ("if ", "assert", "raise")
                    ):
                        offenders.append(f"{package}/views.py:{lineno}: {stripped}")
        self.assertEqual(
            offenders,
            [],
            "authorization belongs in apps.accounts.policies, not in views",
        )
