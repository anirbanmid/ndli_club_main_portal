"""M4 D3 — W9 dashboard authz matrix (owner 2026-10-21, P0).

Every club-activity-controlling endpoint (club dashboard, roster/join
decisions, passkey issue/regenerate/revoke, showcase edit, join URL + QR) is
reachable ONLY by authenticated club authorities with proper credential and
FRESH password state. Anonymous → 401/403 · wrong-club admin → 404/403,
never the data · student member cannot reach admin actions · stale-password
and pending-approval sessions are refused. Client-hidden buttons are
irrelevant: these pins call the server routes directly and assert the
server refuses (I5).

Note (scope): the activity-logger controls land in M5 (``apps.activities``
ships no endpoints yet) — they MUST reuse ``CLUB_AUTHORITY_GATE`` +
``ObjectScope("clubs")`` and extend this matrix.
"""
from __future__ import annotations

from typing import Any

from apps.domain.models import Membership
from apps.members.models import JoinRequest

from .m2_support import build_zone_graph
from .support import Category, SubRole, make_user
from .support import M1PinTestCase as TestCase
from .test_m4_d3_showcase import make_club_admin

#: Every club-activity-controlling route (method, path) as of M4 D3.
CONTROLLING_ENDPOINTS: tuple[tuple[str, str], ...] = (
    ("GET", "/api/v1/clubs/dashboard/"),
    ("POST", "/api/v1/clubs/dashboard/showcase/"),
    ("GET", "/api/v1/clubs/dashboard/passkey/"),
    ("POST", "/api/v1/clubs/dashboard/passkey/issue/"),
    ("POST", "/api/v1/clubs/dashboard/passkey/regenerate/"),
    ("POST", "/api/v1/clubs/dashboard/passkey/revoke/"),
    ("GET", "/api/v1/clubs/dashboard/passkey/join-url/"),
    ("GET", "/api/v1/clubs/dashboard/passkey/qr.svg"),
    ("GET", "/api/v1/members/joins/"),
    ("POST", "/api/v1/members/joins/1/confirm/"),
    ("POST", "/api/v1/members/joins/1/reject/"),
)


class W9AuthzMatrixTests(TestCase):
    """The W9 matrix — one named pin per caller class."""

    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.club = self.graph["NORTH"]["club"]
        self.other_club = self.graph["WEST"]["club"]
        self.admin = make_club_admin("d3w9admin", self.club)
        self.other_admin = make_club_admin("d3w9other", self.other_club)
        self.student = make_user(
            username="d3w9student",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            email="w9.student@example.test",
            institution_code=self.club.institution.code,
            club_code=self.club.code,
        )
        self.join_request = JoinRequest.objects.create(
            user=self.student, club=self.club
        )

    def _call(self, method: str, path: str) -> Any:
        caller = getattr(self.client, method.lower())
        return caller(path, data={"tagline": "x"}, content_type="application/json")

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

    def test_w9_student_member_cannot_reach_admin_actions(self) -> None:
        self.client.force_login(self.student)
        self._assert_all_refused((401, 403))
        # The server refused: the student's own join request is still pending
        # and no membership exists (client-hidden buttons are irrelevant).
        self.join_request.refresh_from_db()
        self.assertEqual(self.join_request.status, JoinRequest.Status.PENDING)
        self.assertFalse(Membership.objects.filter(user=self.student).exists())

    def test_w9_stale_password_state_is_refused_everywhere(self) -> None:
        stale = make_club_admin(
            "d3w9stale", self.club, must_change_password=True
        )
        self.client.force_login(stale)
        self._assert_all_refused((401, 403))

    def test_w9_pending_approval_account_is_refused_everywhere(self) -> None:
        from apps.accounts.models import AccountState

        pending = make_club_admin(
            "d3w9pending",
            self.club,
            account_state=AccountState.PENDING_APPROVAL,
        )
        self.client.force_login(pending)
        self._assert_all_refused((401, 403))

    def test_w9_general_public_is_refused_everywhere(self) -> None:
        public = make_user(
            username="d3w9public",
            category=Category.GENERAL_PUBLIC,
            sub_role=SubRole.ANONYMOUS,
        )
        self.client.force_login(public)
        self._assert_all_refused((401, 403))

    def test_w9_wrong_club_admin_confirm_is_404_and_changes_nothing(self) -> None:
        self.client.force_login(self.other_admin)
        for action in ("confirm", "reject"):
            with self.subTest(action=action):
                response = self.client.post(
                    f"/api/v1/members/joins/{self.join_request.pk}/{action}/"
                )
                self.assertEqual(response.status_code, 404)
                body = response.content.decode("utf-8")
                self.assertNotIn("w9.student@example.test", body)
                self.assertNotIn("d3w9student", body)
        self.join_request.refresh_from_db()
        self.assertEqual(self.join_request.status, JoinRequest.Status.PENDING)
        self.assertFalse(Membership.objects.filter(user=self.student).exists())

    def test_w9_wrong_club_admin_never_reads_other_club_rows(self) -> None:
        self.client.force_login(self.other_admin)
        response = self.client.get("/api/v1/members/joins/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["results"], [])
        body = response.content.decode("utf-8")
        self.assertNotIn("w9.student@example.test", body)
        # The dashboard is scoped to the CALLER's club — never another's.
        dashboard = self.client.get("/api/v1/clubs/dashboard/")
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.json()["club"]["code"], self.other_club.code)
        self.assertNotIn(self.club.code, dashboard.content.decode("utf-8"))

    def test_w9_showcase_edit_stays_inside_the_callers_club(self) -> None:
        # Club A publishes its showcase first ...
        self.client.force_login(self.admin)
        created = self.client.post(
            "/api/v1/clubs/dashboard/showcase/",
            data={"tagline": "Club A tagline", "about": "A"},
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 200, created.content)
        slug_a = created.json()["slug"]
        self.client.logout()
        # ... then club B's admin edits "their" showcase: club A is untouched.
        self.client.force_login(self.other_admin)
        edited = self.client.post(
            "/api/v1/clubs/dashboard/showcase/",
            data={"tagline": "Club B tagline", "about": "B"},
            content_type="application/json",
        )
        self.assertEqual(edited.status_code, 200, edited.content)
        self.assertNotEqual(edited.json()["slug"], slug_a)
        self.client.logout()
        page_a = self.client.get(f"/api/v1/clubs/showcase/{slug_a}/")
        self.assertEqual(page_a.json()["tagline"], "Club A tagline")

    def test_w9_cross_club_and_unknown_ids_are_indistinguishable(self) -> None:
        self.client.force_login(self.other_admin)
        known = self.client.post(
            f"/api/v1/members/joins/{self.join_request.pk}/confirm/"
        )
        unknown = self.client.post("/api/v1/members/joins/999999/confirm/")
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.content, unknown.content)

    def test_w9_club_authority_reaches_the_dashboard(self) -> None:
        """Positive control: the SAME endpoints work for the right caller."""
        self.client.force_login(self.admin)
        dashboard = self.client.get("/api/v1/clubs/dashboard/")
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.json()["club"]["code"], self.club.code)
        issue = self.client.post("/api/v1/clubs/dashboard/passkey/issue/")
        self.assertEqual(issue.status_code, 201, issue.content)
        joins = self.client.get("/api/v1/members/joins/")
        self.assertEqual(joins.status_code, 200)
        self.assertEqual(len(joins.json()["results"]), 1)
        confirmed = self.client.post(
            f"/api/v1/members/joins/{self.join_request.pk}/confirm/"
        )
        self.assertEqual(confirmed.status_code, 201, confirmed.content)
        self.assertTrue(Membership.objects.filter(user=self.student).exists())

    def test_w9_the_public_showcase_is_read_only_for_all_callers(self) -> None:
        self.client.force_login(self.admin)
        published = self.client.post(
            "/api/v1/clubs/dashboard/showcase/",
            data={"tagline": "t", "about": "a"},
            content_type="application/json",
        )
        slug = published.json()["slug"]
        self.client.logout()
        for label, user in (
            ("anonymous", None),
            ("student", self.student),
            ("other-club-admin", self.other_admin),
        ):
            if user is None:
                self.client.logout()
            else:
                self.client.force_login(user)
            with self.subTest(caller=label):
                read = self.client.get(f"/api/v1/clubs/showcase/{slug}/")
                self.assertEqual(read.status_code, 200)
                write = self.client.post(
                    f"/api/v1/clubs/showcase/{slug}/",
                    data={"tagline": "hijack", "about": "x"},
                    content_type="application/json",
                )
                self.assertIn(write.status_code, (401, 403, 405))
        self.client.logout()
        final = self.client.get(f"/api/v1/clubs/showcase/{slug}/")
        self.assertEqual(final.json()["tagline"], "t")
