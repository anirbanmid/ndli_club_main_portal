"""Tests for the Succession app (M2-A3 dual-control succession desk).

Pins the owner-approved Batch-2 decisions:

* conflict check + explicit confirmation at submission, conflict details ride
  along so the approving IIT Kgp employee can re-verify;
* duty-derived approver (``assigned_states``), in-club Executive decision,
  requester ≠ approver (two-person rule), Central Admin oversight-only,
  Super Admin sees no business rows (§3b);
* atomic swap on approval: confirmed conflicts ended, incumbent ended, the
  account provisioned/converted with EXISTING passwords preserved, temp
  password only for brand-new accounts;
* the two doors (club vs /admin/), honest-empty clubless desk, mass-assignment
  and out-of-scope guards, audit rows.
"""

from __future__ import annotations

from typing import Any

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import AccountState, Category, SubRole, User
from apps.audit.models import AuditLog
from apps.domain.models import (
    AuthorityAssignment,
    Club,
    Institution,
    State,
    Zone,
)
from apps.succession.models import SuccessionRequest
from apps.succession.services import (
    SuccessionError,
    authorize_decision,
    decide_at_desk,
    submit_request,
)
from tests.support import GOOD_PASSWORD, attach_duty, make_user

CLUB_URL = "/api/v1/succession/"
DESK_URL = "/admin/api/v1/succession/desk/"
ADMIN_URL = "/admin/api/v1/succession/"


class SuccessionFixture(TestCase):
    """One club with three Main Admins, an Executive, an incumbent and staff."""

    # Fixture attributes created in setUpTestData (declared for mypy).
    zone: Zone
    state: State
    state_other: State
    institution: Institution
    club: Club
    other_institution: Institution
    other_club: Club
    president: Any
    secretary: Any
    executive: Any
    outsider: Any
    clubless: Any
    student: Any
    incumbent: Any
    emp: Any
    emp_other: Any
    central: Any
    super_admin: Any
    proposed_new: str

    @classmethod
    def setUpTestData(cls) -> None:
        cls.zone = Zone.objects.create(code="Z-SU", name="South")
        cls.state = State.objects.create(code="WB", name="West Bengal", zone=cls.zone)
        cls.state_other = State.objects.create(code="OD", name="Odisha", zone=cls.zone)
        cls.institution = Institution.objects.create(
            code="INST-SU", legacy_id="onb-su", name="SU Institute", state=cls.state
        )
        cls.club = Club.objects.create(
            code="CLB-SU", institution=cls.institution, name="SU Club"
        )
        cls.other_institution = Institution.objects.create(
            code="INST-OD",
            legacy_id="onb-od",
            name="OD Institute",
            state=cls.state_other,
        )
        cls.other_club = Club.objects.create(
            code="CLB-OD", institution=cls.other_institution, name="OD Club"
        )

        cls.president = make_user(
            username="succ_pres",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            email="pres@succ.test",
            club_code="CLB-SU",
        )
        cls.secretary = make_user(
            username="succ_sec",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email="sec@succ.test",
            club_code="CLB-SU",
        )
        cls.executive = make_user(
            username="succ_exec",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_EXECUTIVE,
            email="exec@succ.test",
            club_code="CLB-SU",
        )
        cls.outsider = make_user(
            username="succ_out",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            email="out@succ.test",
            club_code="CLB-OD",
        )
        cls.clubless = make_user(
            username="succ_noclub",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email="noclub@succ.test",
        )
        cls.student = make_user(
            username="succ_stud",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            email="stud@succ.test",
            club_code="CLB-SU",
        )
        cls.emp = make_user(
            username="succ_emp",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            email="empwb@succ.test",
        )
        cls.emp_other = make_user(
            username="succ_empod",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            email="empod@succ.test",
        )
        cls.central = make_user(
            username="succ_central",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
            email="central@succ.test",
        )
        cls.super_admin = make_user(
            username="succ_superops",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.SUPER_ADMIN_OPS,
            email="superops@succ.test",
        )
        attach_duty(cls.emp, "WB")
        attach_duty(cls.emp_other, "OD")

        cls.incumbent = make_user(
            username="succ_inc",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            email="inc@succ.test",
            club_code="CLB-SU",
        )
        AuthorityAssignment.objects.create(
            user=cls.incumbent,
            club=cls.club,
            tier="president",
            from_date=timezone.now().date(),
            status=AuthorityAssignment.Status.ACTIVE,
        )
        cls.proposed_new = "newperson@succ.test"

    # --- helpers ----------------------------------------------------------

    def _login(self, user: Any, *, mfa: bool = True) -> None:
        # Mirrors the grievances desk tests — the admin gate needs MFA.
        self.client.force_login(user)
        if mfa:
            session = self.client.session
            session["mfa_verified"] = True
            session.save()

    def _submit(self, **extra: Any) -> Any:
        payload: dict[str, Any] = {
            "tier": "president",
            "name": "New Person",
            "email": self.proposed_new,
            "reason": "Handover requested by the club.",
        }
        payload.update(extra)
        return self.client.post(CLUB_URL, payload)

    def _decide_club(self, pk: Any, **extra: Any) -> Any:
        payload: dict[str, Any] = {"decision": "approve"}
        payload.update(extra)
        return self.client.post(f"{CLUB_URL}{pk}/decide/", payload)

    def _decide_desk(self, pk: Any, **extra: Any) -> Any:
        payload: dict[str, Any] = {"decision": "approve"}
        payload.update(extra)
        return self.client.post(f"{ADMIN_URL}{pk}/decide/", payload)

    def _desk_ids(self) -> list[str]:
        res = self.client.get(DESK_URL)
        self.assertEqual(res.status_code, 200)
        return [row["id"] for row in res.json()["results"]]


class SubmissionAPITests(SuccessionFixture):
    """The club door: intake, validation, conflict confirmation, scoping."""

    def test_only_main_admins_may_propose(self) -> None:
        self._login(self.executive)
        res = self._submit(tier="executive")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()["code"], "not_main_admin")
        self.assertEqual(SuccessionRequest.objects.count(), 0)

        self.client.logout()
        self._login(self.student)
        res = self._submit()
        self.assertEqual(res.status_code, 403)  # gate: students never enter
        self.assertEqual(SuccessionRequest.objects.count(), 0)

    def test_submission_snapshots_the_club_and_ignores_mass_assignment(self) -> None:
        self._login(self.president)
        res = self._submit(
            status="approved",
            club_id="CLB-OD",
            submitted_by=999,
            decided_by=999,
            conflict_snapshot=[{"club_code": "FAKE"}],
        )
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body["status"], "pending")
        self.assertEqual(body["club_code"], "CLB-SU")  # from the caller, not the body
        self.assertIsNone(body["decided_by"])
        self.assertEqual(body["conflicts"], [])

        # the list rows carry the CURRENT holder (the post the approval ends)
        listed = self.client.get(CLUB_URL).json()["results"]
        self.assertEqual(listed[0]["current_holder"], "succ_inc")

        # another club's door shows nothing and hides the detail (404)
        self.client.logout()
        self._login(self.outsider)
        res = self.client.get(CLUB_URL)
        self.assertEqual(res.json()["results"], [])
        res = self.client.get(f"{CLUB_URL}{body['id']}/")
        self.assertEqual(res.status_code, 404)

    def test_conflicts_require_confirmation_and_reach_the_approver(self) -> None:
        holder = make_user(
            username="succ_elsewhere",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email="elsewhere@succ.test",
            club_code="CLB-OD",
        )
        AuthorityAssignment.objects.create(
            user=holder,
            club=self.other_club,
            tier="secretary",
            from_date=timezone.now().date(),
            status=AuthorityAssignment.Status.ACTIVE,
        )

        self._login(self.president)
        res = self._submit(
            tier="secretary", email="elsewhere@succ.test", name="Else Where"
        )
        self.assertEqual(res.status_code, 409)
        body = res.json()
        self.assertEqual(body["code"], "conflict_confirmation_required")
        self.assertEqual(len(body["conflicts"]), 1)
        self.assertEqual(body["conflicts"][0]["club_name"], "OD Club")
        self.assertEqual(SuccessionRequest.objects.count(), 0)  # queued nothing

        res = self._submit(
            tier="secretary",
            email="elsewhere@succ.test",
            name="Else Where",
            confirm_conflict=True,
        )
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertTrue(body["conflicts_confirmed"])
        self.assertEqual(body["conflicts"][0]["tier"], "secretary")

        # the same conflict info is what the employee re-verifies at the desk
        self.client.logout()
        self._login(self.emp, mfa=True)
        res = self.client.get(f"{ADMIN_URL}{body['id']}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["conflicts"][0]["club_name"], "OD Club")

    def test_submission_validation_codes(self) -> None:
        self._login(self.president)
        res = self._submit(tier="grandmaster")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["code"], "invalid_tier")

        # the club UI's label normalizes to the canonical tier value
        res = self._submit(tier="Executive Member")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["tier"], "executive")

        res = self._submit(email="")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["code"], "missing_fields")

        res = self._submit(email="nope")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["code"], "invalid_email")

        res = self._submit(email="inc@succ.test")  # the incumbent themselves
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["code"], "proposed_is_incumbent")

        res = self._submit(email="central@succ.test")  # a module account
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["code"], "proposed_is_employee_account")

        # one pending request per club+tier (partial unique constraint)
        res = self._submit(tier="executive")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()["code"], "pending_exists")
        self.assertEqual(SuccessionRequest.objects.count(), 1)

    def test_clubless_account_gets_an_honest_empty_desk(self) -> None:
        self._login(self.clubless)
        res = self.client.get(CLUB_URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["results"], [])
        res = self._submit()
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["code"], "no_linked_club")

    def test_executive_council_is_view_only(self) -> None:
        self._login(self.president)
        first = self._submit().json()
        self.assertEqual(first["status"], "pending")

        self.client.logout()
        self._login(self.executive)
        res = self.client.get(CLUB_URL)
        self.assertIn(first["id"], [row["id"] for row in res.json()["results"]])

        res = self._submit(tier="executive", email="someone@succ.test")
        self.assertEqual(res.status_code, 403)  # may not propose
        res = self._decide_club(first["id"], decision="reject")
        self.assertEqual(res.status_code, 403)  # may not decide (Main Admin gate)


class DecisionAPITests(SuccessionFixture):
    """The two doors: duty scoping, the atomic swap, the two-person rule."""

    def _queue_two(self) -> tuple[str, str]:
        """One officer-tier request + one executive-tier request (pending)."""
        self._login(self.president)
        officer_tier = self._submit().json()["id"]
        self.client.logout()
        self._login(self.secretary)
        executive_tier = self._submit(
            tier="executive", name="Exec New", email="execnew@succ.test"
        ).json()["id"]
        self.client.logout()
        return officer_tier, executive_tier

    def test_desk_is_duty_scoped_and_keeps_executive_off_it(self) -> None:
        officer_tier, executive_tier = self._queue_two()

        self._login(self.emp_other, mfa=True)  # officer of ANOTHER state
        self.assertNotIn(officer_tier, self._desk_ids())

        self.client.logout()
        self._login(self.emp, mfa=True)  # officer on duty for the club
        ids = self._desk_ids()
        self.assertIn(officer_tier, ids)
        self.assertNotIn(executive_tier, ids)  # in-club decision, never here

        self.client.logout()
        self._login(self.central, mfa=True)  # oversight: reads everything
        ids = self._desk_ids()
        self.assertIn(officer_tier, ids)
        self.assertIn(executive_tier, ids)

    def test_officer_of_another_state_gets_a_404_and_touches_nothing(self) -> None:
        officer_tier, _executive_tier = self._queue_two()
        self._login(self.emp_other, mfa=True)
        res = self._decide_desk(officer_tier)
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json()["code"], "not_found")
        self.assertEqual(
            SuccessionRequest.objects.get(pk=officer_tier).status,
            SuccessionRequest.Status.PENDING,
        )

    def test_central_admin_reads_everything_but_never_decides(self) -> None:
        officer_tier, executive_tier = self._queue_two()
        self._login(self.central, mfa=True)
        for pk in (officer_tier, executive_tier):
            with self.subTest(pk=pk):
                res = self._decide_desk(pk)
                self.assertEqual(res.status_code, 403)
                self.assertEqual(res.json()["code"], "oversight_only")
        self.assertEqual(
            SuccessionRequest.objects.filter(
                status=SuccessionRequest.Status.PENDING
            ).count(),
            2,
        )

    def test_super_admin_sees_no_business_rows(self) -> None:
        officer_tier, _executive_tier = self._queue_two()
        self._login(self.super_admin, mfa=True)
        self.assertEqual(self._desk_ids(), [])  # ops house: zero business data
        res = self._decide_desk(officer_tier)
        self.assertEqual(res.status_code, 404)

    def test_officer_approve_executes_the_full_swap(self) -> None:
        self._login(self.president)
        req_id = self._submit().json()["id"]

        self.client.logout()
        self._login(self.emp, mfa=True)
        res = self._decide_desk(req_id, note="verified")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["status"], "approved")
        self.assertEqual(body["decided_by"], self.emp.username)
        self.assertEqual(body["decision_note"], "verified")
        self.assertTrue(body["account_created"])
        temporary_password = body["temporary_password"]

        # the incumbent post is ended, the new appointment goes live
        incumbent_row = AuthorityAssignment.objects.get(
            user=self.incumbent, club=self.club, tier="president"
        )
        self.assertEqual(incumbent_row.status, AuthorityAssignment.Status.ENDED)
        self.assertIsNotNone(incumbent_row.to_date)

        holder = User.objects.get(email__iexact=self.proposed_new)
        new_row = AuthorityAssignment.objects.get(
            user=holder, club=self.club, tier="president"
        )
        self.assertEqual(new_row.status, AuthorityAssignment.Status.ACTIVE)
        self.assertEqual(holder.category, Category.CLUB_ADMIN)
        self.assertEqual(holder.sub_role, SubRole.CLUB_PRESIDENT)
        self.assertEqual(holder.club_id, "CLB-SU")
        self.assertEqual(holder.account_state, AccountState.ACTIVE)
        self.assertTrue(holder.check_password(temporary_password))
        self.assertTrue(holder.must_change_password)

        self.assertTrue(
            AuditLog.objects.filter(
                action="succession.approved", object_id=req_id
            ).exists()
        )
        # a decided request leaves the queue action
        res = self._decide_desk(req_id, decision="reject")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()["code"], "already_decided")

    def test_existing_account_keeps_its_password_on_conversion(self) -> None:
        self._login(self.president)
        req_id = self._submit(
            tier="secretary", email="stud@succ.test", name="Stud Ent"
        ).json()["id"]

        self.client.logout()
        self._login(self.emp, mfa=True)
        res = self._decide_desk(req_id)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertFalse(body["account_created"])
        self.assertNotIn("temporary_password", body)

        self.student.refresh_from_db()
        self.assertEqual(self.student.category, Category.CLUB_ADMIN)
        self.assertEqual(self.student.sub_role, SubRole.CLUB_SECRETARY)
        self.assertEqual(self.student.club_id, "CLB-SU")
        self.assertTrue(self.student.check_password(GOOD_PASSWORD))
        self.assertFalse(self.student.must_change_password)

    def test_confirmed_conflict_is_executed_on_approval(self) -> None:
        holder = make_user(
            username="succ_elsewhere2",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email="elsewhere2@succ.test",
            club_code="CLB-OD",
        )
        other_row = AuthorityAssignment.objects.create(
            user=holder,
            club=self.other_club,
            tier="secretary",
            from_date=timezone.now().date(),
            status=AuthorityAssignment.Status.ACTIVE,
        )

        self._login(self.president)
        req_id = self._submit(
            tier="president",
            email="elsewhere2@succ.test",
            name="Else Two",
            confirm_conflict=True,
        ).json()["id"]

        self.client.logout()
        self._login(self.emp, mfa=True)
        res = self._decide_desk(req_id)
        self.assertEqual(res.status_code, 200)

        other_row.refresh_from_db()  # the confirmed handover ends elsewhere
        self.assertEqual(other_row.status, AuthorityAssignment.Status.ENDED)
        holder.refresh_from_db()
        self.assertEqual(holder.club_id, "CLB-SU")
        self.assertEqual(holder.sub_role, SubRole.CLUB_PRESIDENT)
        self.assertEqual(
            SuccessionRequest.objects.get(pk=req_id).status,
            SuccessionRequest.Status.APPROVED,
        )

    def test_new_conflict_blocks_approval_for_reverification(self) -> None:
        self._login(self.president)
        req_id = self._submit().json()["id"]  # no conflicts at submission

        # AFTER submission the proposed email takes up a post elsewhere
        late_holder = make_user(
            username="succ_late",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            email=self.proposed_new,
            club_code="CLB-OD",
        )
        AuthorityAssignment.objects.create(
            user=late_holder,
            club=self.other_club,
            tier="secretary",
            from_date=timezone.now().date(),
            status=AuthorityAssignment.Status.ACTIVE,
        )

        self.client.logout()
        self._login(self.emp, mfa=True)
        res = self._decide_desk(req_id)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()["code"], "conflict_changed")
        self.assertEqual(len(res.json()["conflicts"]), 1)

        req = SuccessionRequest.objects.get(pk=req_id)
        self.assertEqual(req.status, SuccessionRequest.Status.PENDING)  # untouched
        self.assertFalse(
            AuthorityAssignment.objects.filter(
                club=self.club, tier="president", user=late_holder
            ).exists()
        )
        self.assertTrue(
            AuthorityAssignment.objects.filter(
                user=self.incumbent, status=AuthorityAssignment.Status.ACTIVE
            ).exists()
        )

    def test_executive_is_decided_in_club_by_another_main_admin(self) -> None:
        self._login(self.secretary)
        req_id = self._submit(
            tier="executive", name="Exec New", email="execnew2@succ.test"
        ).json()["id"]

        # two-person rule: the requester never decides their own request
        res = self._decide_club(req_id)
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()["code"], "same_person_forbidden")

        # ANOTHER Main Admin of the same club decides
        self.client.logout()
        self._login(self.president)
        res = self._decide_club(req_id, note="peer approved")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "approved")

        holder = User.objects.get(email__iexact="execnew2@succ.test")
        row = AuthorityAssignment.objects.get(
            user=holder, club=self.club, tier="executive"
        )
        self.assertEqual(row.status, AuthorityAssignment.Status.ACTIVE)
        self.assertEqual(holder.sub_role, SubRole.CLUB_EXECUTIVE)
        self.assertEqual(holder.club_id, "CLB-SU")

        # a Main Admin of ANOTHER club cannot even see it
        self.client.logout()
        self._login(self.outsider)
        res = self._decide_club(req_id, decision="reject")
        self.assertEqual(res.status_code, 404)

        # the employee door never carries executive rows (in-club decision)
        self.client.logout()
        self._login(self.emp, mfa=True)
        res = self.client.get(f"{ADMIN_URL}{req_id}/")
        self.assertEqual(res.status_code, 404)
        res = self._decide_desk(req_id)
        self.assertEqual(res.status_code, 404)

    def test_wrong_door_enforcement_and_reject_flow(self) -> None:
        # another Main Admin submits, so the deciding account is a PEER —
        # the assertions below are about the door, not the two-person rule
        self._login(self.secretary)
        req_id = self._submit().json()["id"]
        self.client.logout()
        self._login(self.president)

        # the club door never decides officer-tier posts
        res = self._decide_club(req_id)
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()["code"], "employee_approval_required")

        # the officer on duty rejects instead — with a note
        self.client.logout()
        self._login(self.emp, mfa=True)
        res = self._decide_desk(req_id, decision="reject", note="needs recheck")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["status"], "rejected")
        self.assertEqual(body["decided_by"], self.emp.username)
        self.assertEqual(body["decision_note"], "needs recheck")
        self.assertNotIn("temporary_password", body)
        self.assertTrue(
            AuditLog.objects.filter(
                action="succession.rejected", object_id=req_id
            ).exists()
        )

        # the incumbent is untouched by a rejection
        self.assertTrue(
            AuthorityAssignment.objects.filter(
                user=self.incumbent, status=AuthorityAssignment.Status.ACTIVE
            ).exists()
        )
        res = self._decide_desk(req_id)
        self.assertEqual(res.status_code, 409)

    def test_anonymous_and_door_gates(self) -> None:
        for url in (CLUB_URL, DESK_URL):
            with self.subTest(url=url):
                res = self.client.get(url)
                self.assertIn(res.status_code, (401, 403))
                res = self.client.post(url, {})
                self.assertIn(res.status_code, (401, 403))

        # a club account never reaches the admin desk...
        self._login(self.president)
        res = self.client.get(DESK_URL)
        self.assertEqual(res.status_code, 403)

        # ...and an employee without the second factor does not either
        self.client.logout()
        self._login(self.emp, mfa=False)
        res = self.client.get(DESK_URL)
        self.assertEqual(res.status_code, 403)


class ServiceRulePins(SuccessionFixture):
    """The rules at their own layer (services), independent of any door."""

    def test_duty_gate_denies_an_officer_of_another_state(self) -> None:
        req = submit_request(
            user=self.president,
            tier="president",
            name="Svc Person",
            email="svc@succ.test",
            reason="Duty pin.",
        )
        with self.assertRaises(SuccessionError) as ctx:
            authorize_decision(user=self.emp_other, req=req)
        self.assertEqual(ctx.exception.code, "not_the_assigned_officer")
        # the officer on duty passes the same gate
        authorize_decision(user=self.emp, req=req)

    def test_out_of_duty_decision_looks_like_missing(self) -> None:
        req = submit_request(
            user=self.president,
            tier="president",
            name="Svc Person 2",
            email="svc2@succ.test",
            reason="Scope pin.",
        )
        with self.assertRaises(SuccessionError) as ctx:
            decide_at_desk(pk=req.pk, user=self.emp_other, decision="approve")
        self.assertEqual(ctx.exception.code, "not_found")
        req.refresh_from_db()
        self.assertEqual(req.status, SuccessionRequest.Status.PENDING)

    def test_two_person_rule_fires_before_anything_else(self) -> None:
        req = submit_request(
            user=self.president,
            tier="executive",
            name="Self Shot",
            email="selfshot@succ.test",
            reason="Two-person pin.",
        )
        with self.assertRaises(SuccessionError) as ctx:
            authorize_decision(user=self.president, req=req)
        self.assertEqual(ctx.exception.code, "same_person_forbidden")

    def test_employee_accounts_are_never_repointed(self) -> None:
        with self.assertRaises(SuccessionError) as ctx:
            submit_request(
                user=self.president,
                tier="secretary",
                name="Module Account",
                email="central@succ.test",
                reason="Guard pin.",
            )
        self.assertEqual(ctx.exception.code, "proposed_is_employee_account")
