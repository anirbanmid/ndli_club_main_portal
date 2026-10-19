"""D5 — capacity hygiene pins (BRIEF_M2.md §3 / P2: the 110K floor).

Named pins (each one measures QUERY COUNTS, not vibes):
* the institution directory page is a FIXED 2 queries regardless of row
  count, with the full state/district/zone chain pre-fetched (no N+1);
* the club roster and user memberships are 1 query at any roster size;
* page sizes are BOUNDED (MAX_PAGE_SIZE hard cap);
* the officer routing cache is explicit: 1 query cold, 0 warm, and every
  assignment/state write invalidates it (P4 explicit invalidation).
"""
from __future__ import annotations

from datetime import date

from django.contrib.auth import get_user_model

from apps.accounts.models import Category, SubRole, User
from apps.core import scoping
from apps.domain import assignments, queries
from apps.domain.models import Club, Institution, Membership

from .m2_support import add_membership, assign_officer, build_zone_graph
from .support import M1PinTestCase as TestCase
from .support import make_user


def _bulk_students(prefix: str, count: int) -> list:
    user_model = get_user_model()
    users = [
        user_model(username=f"{prefix}-{index}")
        for index in range(count)
    ]
    user_model.objects.bulk_create(users)
    return list(users)


class DirectoryQueryPins(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.delhi = self.graph["NORTH"]["state"]
        for index in range(4):
            Institution.objects.create(
                code=f"INST-DU-1{index:02d}",
                legacy_id=f"LEG-INST-DU-1{index:02d}",
                name=f"Delhi extra sample {index}",
                state=self.delhi,
            )

    def test_directory_page_is_two_queries_at_any_row_count(self) -> None:
        with self.assertNumQueries(2):
            rows, total = queries.institution_directory(state_code="DELHI")
            for institution in rows:
                _ = institution.zone.code  # derived zone, zero extra queries
        self.assertEqual(total, 5)
        for index in range(40):
            Institution.objects.create(
                code=f"INST-DU-2{index:02d}",
                legacy_id=f"LEG-INST-DU-2{index:02d}",
                name=f"Delhi bulk sample {index}",
                state=self.delhi,
            )
        with self.assertNumQueries(2):
            rows, total = queries.institution_directory(state_code="DELHI")
            for institution in rows:
                _ = institution.zone.code
        self.assertEqual(total, 45)

    def test_page_size_is_bounded(self) -> None:
        self.assertEqual(queries.bounded_page_size(10_000), queries.MAX_PAGE_SIZE)
        self.assertEqual(queries.bounded_page_size(0), 1)
        self.assertEqual(queries.bounded_page_size(None), queries.DEFAULT_PAGE_SIZE)
        rows, _total = queries.institution_directory(page_size=10_000)
        self.assertLessEqual(len(rows), queries.MAX_PAGE_SIZE)


class RosterQueryPins(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.club = self.graph["NORTH"]["club"]

    def test_club_roster_is_one_query_at_any_roster_size(self) -> None:
        for index in range(5):
            user = make_user(
                username=f"d5stu{index}",
                category=Category.STUDENT_MEMBER,
                sub_role=SubRole.STUDENT_MEMBER,
            )
            add_membership(user, self.club)
        with self.assertNumQueries(1):
            roster = queries.club_roster(self.club.code)
            for membership in roster:
                _ = membership.club.institution.state.zone.code
                _ = membership.user.username
        self.assertEqual(len(roster), 5)

        for user in _bulk_students("d5bulk", 45):
            add_membership(user, self.club)
        with self.assertNumQueries(1):
            roster = queries.club_roster(self.club.code)
            for membership in roster:
                _ = membership.club.institution.state.zone.code
                _ = membership.user.username
        self.assertEqual(len(roster), 50)

    def test_memberships_of_user_is_one_query(self) -> None:
        user = make_user(
            username="d5member",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
        )
        add_membership(user, self.club)
        with self.assertNumQueries(1):
            rows = queries.memberships_of_user(user.pk)
            for membership in rows:
                _ = membership.club.institution.state.name
        self.assertEqual(len(rows), 1)

    def test_officer_roster_is_one_query(self) -> None:
        assign_officer("EMP01", self.graph["NORTH"]["state"])
        assign_officer("EMP03", self.graph["WEST"]["state"])
        with self.assertNumQueries(1):
            rows = queries.officer_roster()
            for row in rows:
                _ = row.officer.username
                _ = row.state.zone.code
        self.assertEqual(len(rows), 2)


class ScopingQueryPins(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.emp03 = make_user(
            username="EMP03",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="WEST",
        )

    def test_zone_scoping_over_joins_is_a_single_query(self) -> None:
        with self.assertNumQueries(1):
            visible = scoping.scope_clubs(Club.objects.all(), self.emp03)
            self.assertEqual(
                list(visible.values_list("code", flat=True)), ["CLB-MH-TECH"]
            )


class OfficerCachePins(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.delhi = self.graph["NORTH"]["state"]

    def test_cold_warm_and_invalidated_lookup_counts(self) -> None:
        assign_officer("EMP01", self.delhi)
        assignments.invalidate_officer_cache()
        with self.assertNumQueries(1):
            self.assertEqual(assignments.officer_username_for_state("DELHI"), "EMP01")
        with self.assertNumQueries(0):
            self.assertEqual(assignments.officer_username_for_state("DELHI"), "EMP01")
        # Explicit invalidation on every assignment write (P4). The newer
        # window (today) wins the deterministic pick.
        assign_officer("EMP09", self.delhi, from_date=date.today())
        with self.assertNumQueries(1):
            self.assertEqual(assignments.officer_username_for_state("DELHI"), "EMP09")
        with self.assertNumQueries(0):
            assignments.officer_username_for_state("DELHI")

    def test_membership_rows_carry_no_denormalised_zone(self) -> None:
        # P4 by construction: the only zone column on membership is the join.
        columns = {field.column for field in Membership._meta.concrete_fields}
        self.assertNotIn("zone_code", columns)
        self.assertNotIn("zone_id", columns)
        self.assertTrue(User._meta.get_field("zone"))
