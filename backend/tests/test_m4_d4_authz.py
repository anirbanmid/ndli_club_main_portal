"""M4 D4 — W9 dashboard authz matrix for the roster surface (owner
2026-10-21, P0).

Every club-activity-controlling roster endpoint (row create / inline edit /
status move, CSV template / upload / dry-run / commit / job / export) is
reachable ONLY by authenticated club authorities with proper credential and
FRESH password state. Anonymous → 401/403 · student member → 401/403 ·
wrong-club admin → 404/403, never the data · stale-password and
pending-approval sessions are refused. Client-hidden buttons are
irrelevant: these pins call the server routes directly and assert the
server refuses (I5 / W9).

Reuses ``CLUB_AUTHORITY_GATE`` + ``ObjectScope("members")`` (the M1 policy
layer) — NO new authz machinery (W9 / P0).
"""
from __future__ import annotations

from typing import Any

from apps.accounts.models import AccountState, Category, SubRole
from apps.members.models import RosterEntry

from .m2_support import build_zone_graph
from .support import M1PinTestCase as TestCase
from .support import make_user
from .test_m4_d3_showcase import make_club_admin

ROSTER = "/api/v1/members/roster/"

#: Every club-activity-controlling roster route (method, path) as of M4 D4.
#: ``GET roster/`` is the ONE read students legitimately have (own rows
#: only — pinned in test_m4_d4_roster.py W6), so it is NOT in this list.
CONTROLLING_ENDPOINTS: tuple[tuple[str, str], ...] = (
    ("POST", ROSTER + "add/"),
    ("PATCH", ROSTER + "1/"),
    ("POST", ROSTER + "1/status/"),
    ("GET", ROSTER + "import/template/"),
    ("POST", ROSTER + "import/upload/"),
    ("POST", ROSTER + "import/dry-run/"),
    ("POST", ROSTER + "import/commit/"),
    ("GET", ROSTER + "import/jobs/1/"),
    ("GET", ROSTER + "export/"),
)


class W9RosterAuthzTests(TestCase):
    """The W9 matrix — one named pin per caller class."""

    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.club = self.graph["NORTH"]["club"]
        self.other_club = self.graph["WEST"]["club"]
        self.admin = make_club_admin("d4w9admin", self.club)
        self.other_admin = make_club_admin("d4w9other", self.other_club)
        self.student = make_user(
            username="d4w9student",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            email="d4w9.student@example.test",
            institution_code=self.club.institution.code,
            club_code=self.club.code,
        )
        self.entry = RosterEntry.objects.create(
            club=self.club, name="W9 Row", admission_no="ADM900",
            email="w9row@example.test",
        )
        self.other_entry = RosterEntry.objects.create(
            club=self.other_club, name="Other Row", admission_no="ADM901",
            email="w9other@example.test",
        )

    def _call(self, method: str, path: str) -> Any:
        caller = getattr(self.client, method.lower())
        return caller(
            path,
            data={"field": "name", "value": "X", "version": 1},
            content_type="application/json",
        )

    def _assert_all_refused(self, expect: tuple[int, ...]) -> None:
        for method, path in CONTROLLING_ENDPOINTS:
            with self.subTest(endpoint=f"{method} {path}"):
                response = self._call(method, path)
                self.assertIn(
                    response.status_code,
                    expect,
                    f"{method} {path} answered {response.status_code}",
                )

    def test_w9_anonymous_is_401_or_403_on_every_controlling_endpoint(self) -> None:
        self.client.logout()
        self._assert_all_refused((401, 403))
        read = self.client.get(ROSTER)
        self.assertIn(read.status_code, (401, 403))

    def test_w9_student_member_cannot_reach_admin_actions(self) -> None:
        self.client.force_login(self.student)
        self._assert_all_refused((401, 403))
        # The server refused: nothing moved.
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.name, "W9 Row")
        self.assertEqual(self.entry.version, 1)

    def test_w9_stale_password_state_is_refused_everywhere(self) -> None:
        stale = make_club_admin(
            "d4w9stale", self.club, must_change_password=True
        )
        self.client.force_login(stale)
        self._assert_all_refused((401, 403))

    def test_w9_pending_approval_account_is_refused_everywhere(self) -> None:
        pending = make_club_admin(
            "d4w9pending",
            self.club,
            account_state=AccountState.PENDING_APPROVAL,
        )
        self.client.force_login(pending)
        self._assert_all_refused((401, 403))

    def test_w9_general_public_is_refused_everywhere(self) -> None:
        public = make_user(
            username="d4w9public",
            category=Category.GENERAL_PUBLIC,
            sub_role=SubRole.ANONYMOUS,
        )
        self.client.force_login(public)
        self._assert_all_refused((401, 403))

    def test_w9_wrong_club_admin_is_404_never_the_data(self) -> None:
        self.client.force_login(self.other_admin)
        for method, path in (
            ("PATCH", f"{ROSTER}{self.entry.pk}/"),
            ("POST", f"{ROSTER}{self.entry.pk}/status/"),
            ("GET", f"{ROSTER}import/jobs/1/"),
        ):
            with self.subTest(endpoint=f"{method} {path}"):
                response = self._call(method, path)
                self.assertIn(response.status_code, (403, 404))
                body = response.content.decode("utf-8")
                self.assertNotIn("w9row@example.test", body)
                self.assertNotIn("ADM900", body)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.name, "W9 Row")

    def test_w9_cross_club_ids_are_indistinguishable_from_missing(self) -> None:
        self.client.force_login(self.other_admin)
        known = self._call("PATCH", f"{ROSTER}{self.entry.pk}/")
        unknown = self._call("PATCH", f"{ROSTER}999999/")
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.content, unknown.content)

    def test_w9_club_authority_reaches_the_whole_surface(self) -> None:
        """Positive control: the SAME endpoints work for the right caller."""
        self.client.force_login(self.admin)
        add = self.client.post(
            ROSTER + "add/",
            data={"name": "W9 New", "admission_no": "ADM950"},
            content_type="application/json",
        )
        self.assertEqual(add.status_code, 201, add.content)
        edit = self._call("PATCH", f"{ROSTER}{self.entry.pk}/")
        self.assertEqual(edit.status_code, 200, edit.content)
        status = self.client.post(
            f"{ROSTER}{self.entry.pk}/status/",
            data={"status": "suspended", "version": edit.json()["version"]},
            content_type="application/json",
        )
        self.assertEqual(status.status_code, 200, status.content)
        for method, path in (
            ("GET", ROSTER + "import/template/"),
            ("POST", ROSTER + "import/dry-run/"),
            ("POST", ROSTER + "import/commit/"),
            ("GET", ROSTER + "export/"),
        ):
            with self.subTest(endpoint=f"{method} {path}"):
                response = self._call(method, path)
                self.assertLess(response.status_code, 500)
                self.assertNotIn(response.status_code, (401, 403, 404))

    def test_w9_reads_stay_scoped_inside_the_callers_club(self) -> None:
        """A club authority's roster read NEVER crosses the club wall."""
        self.client.force_login(self.other_admin)
        body = self.client.get(ROSTER).json()
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["entries"][0]["id"], self.other_entry.pk)
        self.assertNotIn("w9row@example.test", str(body))
