"""Analytics tests — M6 D4: officer audit dashboards + star rating.

Pinned here:
* the FAITHFUL old-project composite (50/30/20/10 — routes/metrics.py:478),
  including the per-component migrated baseline (old R30);
* every dashboard figure derived from the ledgers (SLAEvent / AuditLog /
  CharterApplication / GrievanceTicket) — hand-computed expectations;
* zone scoping: a zone-bound officer can NEVER see another zone (P0);
* read-only contract on the rating derivation;
* door discipline (unauthenticated / non-decider / non-GET).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import AccountState, Category, SubRole
from apps.analytics_reports.metrics import (
    officers_in_scope,
    visible_zone,
)
from apps.analytics_reports.ratings import (
    BaselineBreakdown,
    evaluate_officers,
    officer_rating,
    stars_for,
)
from apps.audit.models import AuditLog
from apps.audit.services import record as audit_record
from apps.domain.models import (
    AuthorityAssignment,
    Club,
    Institution,
    State,
    Zone,
)
from apps.grievances.models import GrievanceTicket, SLAEvent
from apps.onboarding.models import CharterApplication, OnboardingDraft


def _make_user(username: str, *, category, sub_role, zone_code: str = ""):
    return get_user_model().objects.create_user(
        username=username,
        email=f"{username}@example.test",
        password="x",
        category=category,
        sub_role=sub_role,
        zone_code=zone_code,
        account_state=AccountState.ACTIVE,
    )


class DashboardFixture(TestCase):
    """Shared world: two zones, one club per zone, two officers + central."""

    # Fixture attributes created in setUpTestData/setUp (declared for mypy).
    central: Any
    club_n1: Club
    club_w1: Club
    inst_n1: Institution
    inst_w1: Institution
    officer_n1: Any
    officer_w1: Any
    president: Any
    state_n1: State
    state_w1: State
    zone_n1: Zone
    zone_w1: Zone

    @classmethod
    def setUpTestData(cls) -> None:
        cls.zone_n1 = Zone.objects.create(code="N1", name="North 1")
        cls.zone_w1 = Zone.objects.create(code="W1", name="West 1")
        cls.state_n1 = State.objects.create(
            code="UP", name="Uttar Pradesh", zone=cls.zone_n1
        )
        cls.state_w1 = State.objects.create(
            code="MH", name="Maharashtra", zone=cls.zone_w1
        )
        cls.inst_n1 = Institution.objects.create(
            code="INST-N1", legacy_id="onb-n1", name="N1 Institute", state=cls.state_n1
        )
        cls.inst_w1 = Institution.objects.create(
            code="INST-W1", legacy_id="onb-w1", name="W1 Institute", state=cls.state_w1
        )
        cls.club_n1 = Club.objects.create(
            code="CLUB-N1", institution=cls.inst_n1, name="N1 Club"
        )
        cls.club_w1 = Club.objects.create(
            code="CLUB-W1", institution=cls.inst_w1, name="W1 Club"
        )
        cls.president = _make_user(
            "president1", category=Category.CLUB_ADMIN, sub_role=SubRole.CLUB_PRESIDENT
        )
        AuthorityAssignment.objects.create(
            user=cls.president,
            club=cls.club_n1,
            tier=AuthorityAssignment.Tier.PRESIDENT,
            from_date=timezone.now().date(),
            status=AuthorityAssignment.Status.ACTIVE,
        )
        cls.officer_n1 = _make_user(
            "emp03",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="N1",
        )
        cls.officer_w1 = _make_user(
            "emp05",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code="W1",
        )
        cls.central = _make_user(
            "centraladm",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )

    # --- builders -------------------------------------------------------

    def _ticket(
        self, club, zone_code, state_code, *, status=GrievanceTicket.Status.OPEN
    ):
        now = timezone.now()
        return GrievanceTicket.objects.create(
            club=club,
            raised_by=self.president,
            state_code=state_code,
            zone_code=zone_code,
            subject="Subject",
            description="Body",
            status=status,
            reminder_due_at=now + timedelta(hours=72),
            admin_reminder_due_at=now + timedelta(days=30),
        )

    def _sanctioned(self, officer, *, institution="N1 Institute", club="N1 Club"):
        # OnboardingDraft is UNIQUE on (institution_name, club_name) while the
        # application row carries its own display names — seed the draft with a
        # sequence suffix so two applications can name the SAME club (which is
        # exactly what the distinct-clubs pin needs).
        seq = CharterApplication.objects.count()
        draft = OnboardingDraft.objects.create(
            institution_name=f"{institution}#{seq}",
            club_name=f"{club}#{seq}",
            zone_code="N1",
            state_code="UP",
            resume_token_hash=f"h{seq:062d}",
            resume_token_expires_at=timezone.now() + timedelta(days=7),
        )
        return CharterApplication.objects.create(
            draft=draft,
            institution_name=institution,
            club_name=club,
            zone_code="N1",
            state_code="UP",
            status=CharterApplication.Status.SANCTIONED,
            reviewed_by=officer,
            reviewed_at=timezone.now(),
        )

    @staticmethod
    def _audit(action, actor, zone_code, *, when=None):
        return audit_record(
            action=action,
            actor_id=actor.pk,
            actor_label=actor.get_username(),
            zone_code=zone_code,
            object_type="test",
            object_id="1",
        )


class OfficerRatingTests(DashboardFixture):
    """The composite is the old project's, formula-faithful (50/30/20/10)."""

    def test_composite_matches_old_project_formula(self):
        # 2 clubs approved, 2 tickets closed, 1 phone call,
        # 3 offline training, 2 online workshops
        self._sanctioned(self.officer_n1, club="N1 Club")
        self._sanctioned(self.officer_n1, club="Second Club")
        for _ in range(2):
            ticket = self._ticket(
                self.club_n1, "N1", "UP", status=GrievanceTicket.Status.RESOLVED
            )
            SLAEvent.objects.create(
                ticket=ticket, kind=SLAEvent.Kind.RESOLVED, actor=self.officer_n1
            )
        self._audit("activity.phone_call", self.officer_n1, "N1")
        for _ in range(3):
            self._audit("activity.offline_training", self.officer_n1, "N1")
        for _ in range(2):
            self._audit("activity.online_training", self.officer_n1, "N1")

        rating = officer_rating(self.officer_n1)
        # 0.50*2 + 0.30*(2+1) + 0.20*3 + 0.10*2 = 2.70
        self.assertEqual(rating.clubs_approved, 2)
        self.assertEqual(rating.tickets_closed, 2)
        self.assertEqual(rating.phone_calls, 1)
        self.assertEqual(rating.other_supports, 3)
        self.assertEqual(rating.offline_training, 3)
        self.assertEqual(rating.online_training, 2)
        self.assertEqual(rating.score, 2.70)

    def test_migrated_baseline_adds_per_component(self):
        self._sanctioned(self.officer_n1, club="N1 Club")
        self._sanctioned(self.officer_n1, club="Second Club")
        ticket = self._ticket(
            self.club_n1, "N1", "UP", status=GrievanceTicket.Status.RESOLVED
        )
        SLAEvent.objects.create(
            ticket=ticket, kind=SLAEvent.Kind.RESOLVED, actor=self.officer_n1
        )
        SLAEvent.objects.create(
            ticket=ticket, kind=SLAEvent.Kind.RESOLVED, actor=self.officer_n1
        )
        self._audit("activity.phone_call", self.officer_n1, "N1")
        self._audit("activity.offline_training", self.officer_n1, "N1")
        self._audit("activity.online_training", self.officer_n1, "N1")

        rating = officer_rating(
            self.officer_n1,
            baseline=BaselineBreakdown(approvals=1, support=2, online_workshops=3),
        )
        # clubs 2+1=3, support (2+1)+2=5, offline 1 (no baseline), online 1+3=4
        # 0.50*3 + 0.30*5 + 0.20*1 + 0.10*4 = 1.5 + 1.5 + 0.2 + 0.4 = 3.60
        self.assertEqual(rating.clubs_approved, 3)
        self.assertEqual(rating.other_supports, 5)
        self.assertEqual(rating.offline_training, 1)
        self.assertEqual(rating.online_training, 4)
        self.assertEqual(rating.score, 3.60)

    def test_clubs_are_counted_distinctly(self):
        """A club can never be double-counted.

        Two layers pin it: the schema is UNIQUE on (institution_name,
        club_name) for both the draft and the application row (so the old
        project's "set of club ids" is enforced by the DB here), and only
        SANCTIONED rows enter the count.
        """
        self._sanctioned(self.officer_n1, club="N1 Club")
        self.assertEqual(officer_rating(self.officer_n1).clubs_approved, 1)

        # A queued (not sanctioned) application never counts.
        seq = CharterApplication.objects.count()
        queued_draft = OnboardingDraft.objects.create(
            institution_name=f"Other Institute#{seq}",
            club_name=f"Other Club#{seq}",
            zone_code="N1",
            state_code="UP",
            resume_token_hash=f"q{seq:062d}",
            resume_token_expires_at=timezone.now() + timedelta(days=7),
        )
        CharterApplication.objects.create(
            draft=queued_draft,
            institution_name="Other Institute",
            club_name="Other Club",
            zone_code="N1",
            state_code="UP",
            status=CharterApplication.Status.QUEUED,
            reviewed_by=self.officer_n1,
            reviewed_at=timezone.now(),
        )
        self.assertEqual(officer_rating(self.officer_n1).clubs_approved, 1)

        # The DB refuses a second application naming the same club at all.
        with self.assertRaises(IntegrityError), transaction.atomic():
            self._sanctioned(self.officer_n1, club="N1 Club")

    def test_rating_is_read_only(self):
        self._sanctioned(self.officer_n1, club="N1 Club")
        ticket = self._ticket(self.club_n1, "N1", "UP")
        SLAEvent.objects.create(ticket=ticket, kind=SLAEvent.Kind.BREACH)
        before = (
            AuditLog.objects.count(),
            GrievanceTicket.objects.count(),
            SLAEvent.objects.count(),
            CharterApplication.objects.count(),
        )
        officer_rating(self.officer_n1, baseline=BaselineBreakdown(1, 1, 1))
        self.assertEqual(
            before,
            (
                AuditLog.objects.count(),
                GrievanceTicket.objects.count(),
                SLAEvent.objects.count(),
                CharterApplication.objects.count(),
            ),
        )

    def test_star_banding_thresholds(self):
        self.assertEqual(stars_for(8.0, 10.0), 5)
        self.assertEqual(stars_for(6.0, 10.0), 4)
        self.assertEqual(stars_for(4.0, 10.0), 3)
        self.assertEqual(stars_for(2.0, 10.0), 2)
        self.assertEqual(stars_for(0.5, 10.0), 1)
        self.assertEqual(stars_for(0.0, 0.0), 1)

    def test_cohort_ranking_is_relative(self):
        self._sanctioned(self.officer_n1, club="A Club")
        self._sanctioned(self.officer_n1, club="B Club")
        self._sanctioned(self.officer_n1, club="C Club")
        self._sanctioned(self.officer_w1, club="W Club")
        rows = evaluate_officers([self.officer_n1, self.officer_w1])
        self.assertEqual([r["officer"] for r in rows], ["emp03", "emp05"])
        self.assertEqual(rows[0]["rank"], 1)
        self.assertEqual(rows[0]["weighted_score"], 45.5)
        self.assertEqual(rows[0]["stars"], 2.5)
        self.assertEqual(rows[1]["rank"], 2)

    def test_worked_example_calculation(self):
        """Verify the worked example from user prompt:

        Approved 18, Support 120, Offline 4, Online 6 (NNE).
        Adjusted: 25.2 / 150 / 5 / 7.5.
        Team maxima: 30 / 160 / 6 / 10 -> scores 84 / 93.75 / 83.33 / 75.
        Total = 85.7, Stars = 4.5.
        """
        from apps.analytics_reports.ratings import (
            NORM_WEIGHT_CLUBS_APPROVED,
            NORM_WEIGHT_OFFLINE_TRAINING,
            NORM_WEIGHT_ONLINE_TRAINING,
            NORM_WEIGHT_OTHER_SUPPORTS,
            compute_stars,
        )
        total = (
            NORM_WEIGHT_CLUBS_APPROVED * 84.0
            + NORM_WEIGHT_OTHER_SUPPORTS * 93.75
            + NORM_WEIGHT_OFFLINE_TRAINING * (500.0 / 6.0)
            + NORM_WEIGHT_ONLINE_TRAINING * 75.0
        )
        self.assertAlmostEqual(round(total, 1), 85.7, places=1)
        self.assertEqual(compute_stars(total), 4.5)


class DashboardScopeTests(DashboardFixture):
    """P0: the zone scoping decision is mechanical and total."""

    def test_zone_bound_officer_is_pinned_to_their_zone(self):
        self.assertEqual(visible_zone(self.officer_n1, "W1"), "N1")
        self.assertEqual(visible_zone(self.officer_n1, ""), "N1")

    def test_central_may_choose_any_zone_or_all(self):
        self.assertIsNone(visible_zone(self.central, ""))
        self.assertEqual(visible_zone(self.central, "W1"), "W1")

    def test_officers_in_scope_is_one_row_for_an_officer(self):
        self.assertEqual(
            list(officers_in_scope(self.officer_n1, "W1")), [self.officer_n1]
        )
        self.assertEqual(officers_in_scope(self.central).count(), 2)
        self.assertEqual(list(officers_in_scope(self.central, "W1")), [self.officer_w1])


class DashboardAPITests(DashboardFixture):
    """The /admin/api/v1/dashboards/ surface (derived numbers + doors)."""

    ZONE = "/admin/api/v1/dashboards/zone/"
    OFFICERS = "/admin/api/v1/dashboards/officers/"
    AUDIT = "/admin/api/v1/dashboards/audit/"

    def _login(self, user):
        self.client.force_login(user)
        session = self.client.session
        session["mfa_verified"] = True
        session.save()

    def test_zone_dashboard_numbers_match_the_ledgers(self):
        self._ticket(self.club_n1, "N1", "UP", status=GrievanceTicket.Status.OPEN)
        self._ticket(
            self.club_n1, "N1", "UP", status=GrievanceTicket.Status.NOT_RESOLVED
        )
        closed = self._ticket(
            self.club_n1, "N1", "UP", status=GrievanceTicket.Status.RESOLVED
        )
        SLAEvent.objects.create(ticket=closed, kind=SLAEvent.Kind.BREACH)
        SLAEvent.objects.create(ticket=closed, kind=SLAEvent.Kind.ESCALATION)
        self._sanctioned(self.officer_n1)  # sanctioned -> NOT in the queue
        self._audit("grievance.created", self.officer_n1, "N1")

        self._login(self.officer_n1)
        data = self.client.get(self.ZONE).json()
        self.assertEqual(data["zone_code"], "N1")
        self.assertEqual(data["open_tickets"], 1)
        self.assertEqual(data["not_resolved_tickets"], 1)
        self.assertEqual(data["resolved_tickets"], 1)
        self.assertEqual(data["sla_breaches"], 1)
        self.assertEqual(data["sla_escalations"], 1)
        self.assertEqual(data["charter_queue_depth"], 0)
        self.assertEqual(data["audit_events"], 1)
        # 3 tickets, 1 with a breach mark -> (3-1)/3 = 66.7%
        self.assertEqual(data["sla_compliance_pct"], 66.7)
        self.assertEqual(len(data["recent_audit"]), 1)

    def test_regional_officer_never_sees_another_zone(self):
        self._ticket(self.club_w1, "W1", "MH")
        self._audit("grievance.created", self.officer_w1, "W1")
        self._login(self.officer_n1)
        data = self.client.get(f"{self.ZONE}?zone=W1").json()
        self.assertEqual(data["zone_code"], "N1")
        self.assertEqual(data["open_tickets"], 0)
        self.assertEqual(data["recent_audit"], [])

    def test_central_sees_every_zone(self):
        self._ticket(self.club_n1, "N1", "UP")
        self._ticket(self.club_w1, "W1", "MH")
        self._login(self.central)
        data = self.client.get(self.ZONE).json()
        self.assertIsNone(data["zone_code"])
        self.assertEqual(data["open_tickets"], 2)

    def test_central_unknown_zone_is_empty_not_an_error(self):
        self._ticket(self.club_n1, "N1", "UP")
        self._login(self.central)
        response = self.client.get(f"{self.ZONE}?zone=ZZZ")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["open_tickets"], 0)

    def test_officer_ratings_scoped_to_the_caller(self):
        self._sanctioned(self.officer_n1, club="A Club")
        self._sanctioned(self.officer_w1, club="W Club")
        self._login(self.officer_n1)
        rows = self.client.get(self.OFFICERS).json()["officers"]
        self.assertEqual([r["officer"] for r in rows], ["emp03"])
        self._login(self.central)
        rows = self.client.get(f"{self.OFFICERS}?zone=W1").json()["officers"]
        self.assertEqual([r["officer"] for r in rows], ["emp05"])

    def test_audit_feed_is_zone_scoped(self):
        self._audit("grievance.created", self.officer_n1, "N1")
        self._audit("grievance.created", self.officer_w1, "W1")
        self._login(self.officer_n1)
        rows = self.client.get(self.AUDIT).json()["results"]
        self.assertEqual([r["zone_code"] for r in rows], ["N1"])
        self._login(self.central)
        rows = self.client.get(self.AUDIT).json()["results"]
        self.assertEqual({r["zone_code"] for r in rows}, {"N1", "W1"})

    def test_unauthenticated_is_blocked_everywhere(self):
        for url in (self.ZONE, self.OFFICERS, self.AUDIT):
            response = self.client.get(url)
            self.assertIn(response.status_code, (401, 403), url)

    def test_non_decider_is_blocked(self):
        self._login(self.president)
        for url in (self.ZONE, self.OFFICERS, self.AUDIT):
            self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_writes_are_rejected(self):
        self._login(self.central)
        for url in (self.ZONE, self.OFFICERS, self.AUDIT):
            self.assertIn(
                self.client.post(url, {"zone_code": "W1"}).status_code,
                (403, 405),
                url,
            )

    def test_dashboard_is_read_only_for_the_db(self):
        self._ticket(self.club_n1, "N1", "UP")
        self._login(self.central)
        before = (
            AuditLog.objects.count(),
            GrievanceTicket.objects.count(),
            SLAEvent.objects.count(),
        )
        self.client.get(self.ZONE)
        self.client.get(self.OFFICERS)
        self.client.get(self.AUDIT)
        self.assertEqual(
            before,
            (
                AuditLog.objects.count(),
                GrievanceTicket.objects.count(),
                SLAEvent.objects.count(),
            ),
        )
