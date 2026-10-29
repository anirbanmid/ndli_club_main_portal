"""Tests for the Grievances app (M6 D3 — the issue-lifecycle port).

The pins below mirror the previous project's ``db/issue_manager.py`` exactly;
the 72h / 7d / 30d numbers come from ``settings.GRIEVANCE_SLA`` (P4 store).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any, cast

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import AccountState, Category, SubRole
from apps.audit.models import AuditLog
from apps.domain.models import (
    AuthorityAssignment,
    Club,
    Institution,
    State,
    Zone,
)
from apps.grievances import sla
from apps.grievances.models import GrievanceTicket, SLAEvent
from apps.grievances.services import (
    GrievanceError,
    create_ticket,
    due_reminders,
    queue_for,
    resolve_ticket,
    sweep,
    tickets_for_club_authority,
)


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


class GrievanceFixture(TestCase):
    """Shared world: two zones, one club per zone, one authority + one officer."""

    # Fixture attributes created in setUpTestData/setUp (declared for mypy).
    central: Any
    club_n1: Club
    club_w1: Club
    inst_n1: Institution
    inst_w1: Institution
    officer_n1: Any
    officer_w1: Any
    outsider: Any
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
        cls.outsider = _make_user(
            "outsider1", category=Category.CLUB_ADMIN, sub_role=SubRole.CLUB_SECRETARY
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


class IntakeTests(GrievanceFixture):
    """C4: club authorities only; C2: zone routing from the canonical mapping."""

    def test_authority_intake_routes_by_zone(self):
        ticket = create_ticket(
            raised_by=self.president,
            club=self.club_n1,
            subject="Power cut in lab",
            description="daily 6-8pm",
        )
        self.assertEqual(ticket.zone_code, "N1")
        self.assertEqual(ticket.state_code, "UP")
        self.assertEqual(ticket.status, GrievanceTicket.Status.OPEN)
        cfg = {
            "reminder": ticket.reminder_due_at,
            "admin": ticket.admin_reminder_due_at,
        }
        delta_reminder = cfg["reminder"] - ticket.created_at
        delta_admin = cfg["admin"] - ticket.created_at
        self.assertAlmostEqual(
            delta_reminder.total_seconds(), 72 * 3600, delta=60
        )  # old project: created + 72h
        self.assertAlmostEqual(
            delta_admin.total_seconds(), 30 * 86400, delta=60
        )  # old project: created + 30d

    def test_non_authority_cannot_open_ticket(self):
        with self.assertRaises(GrievanceError) as ctx:
            create_ticket(
                raised_by=self.outsider,
                club=self.club_n1,
                subject="intrusion",
                description="",
            )
        self.assertEqual(str(ctx.exception), "not_club_authority")

    def test_officer_cannot_open_ticket(self):
        with self.assertRaises(GrievanceError) as ctx:
            create_ticket(
                raised_by=self.officer_n1,
                club=self.club_n1,
                subject="intrusion",
                description="",
            )
        self.assertEqual(str(ctx.exception), "not_club_authority")

    def test_zone_never_fabricated(self):
        # C2: the mapping is CONSUMED, never fabricated. domain.State.zone is
        # NOT NULL at the schema level, so the guard is pinned at the derivation
        # seam: any club whose state/zone chain is broken must fail fast.
        from types import SimpleNamespace

        from apps.grievances.services import _derive_zone

        with self.assertRaises(GrievanceError) as ctx:
            _derive_zone(SimpleNamespace(institution=SimpleNamespace(state=None)))
        self.assertEqual(str(ctx.exception), "no_zone_mapping")

        with self.assertRaises(GrievanceError) as ctx:
            _derive_zone(
                SimpleNamespace(
                    institution=SimpleNamespace(state=SimpleNamespace(zone=None))
                )
            )
        self.assertEqual(str(ctx.exception), "no_zone_mapping")

        self.assertEqual(
            _derive_zone(self.club_n1), (self.state_n1.code, self.zone_n1.code)
        )

    def test_intake_writes_audit(self):
        ticket = create_ticket(
            raised_by=self.president,
            club=self.club_n1,
            subject="audit pin",
            description="",
        )
        self.assertTrue(
            AuditLog.objects.filter(
                action="grievance.created", object_id=str(ticket.pk)
            ).exists()
        )

    def test_club_authority_sees_own_club_tickets(self):
        ticket = create_ticket(
            raised_by=self.president, club=self.club_n1, subject="mine", description=""
        )
        self.assertIn(ticket, tickets_for_club_authority(self.president))
        self.assertFalse(tickets_for_club_authority(self.outsider).exists())


class ResolveLifecycleTests(GrievanceFixture):
    """The old issue_manager resolve semantics (72h/7d/30d streams)."""

    # Fixture attributes created in setUpTestData/setUp (declared for mypy).
    admin_due_before: Any
    reminder_before: Any
    ticket: Any

    def setUp(self):
        self.ticket = create_ticket(
            raised_by=self.president,
            club=self.club_n1,
            subject="lifecycle",
            description="",
        )
        self.admin_due_before = self.ticket.admin_reminder_due_at
        self.reminder_before = self.ticket.reminder_due_at

    def test_resolved_closes_streams(self):
        ticket = resolve_ticket(
            ticket_id=self.ticket.pk,
            user=self.officer_n1,
            decision="resolved",
            reason="fixed",
        )
        self.assertEqual(ticket.status, GrievanceTicket.Status.RESOLVED)
        self.assertIsNotNone(ticket.resolved_at)
        self.assertEqual(ticket.resolved_by, self.officer_n1)
        self.assertFalse(due_reminders().filter(pk=ticket.pk).exists())

    def test_officer_not_resolved_keeps_30d_escalation_anchor(self):
        """Old line 275 — the 30d escalation is NEVER postponed."""
        ticket = resolve_ticket(
            ticket_id=self.ticket.pk,
            user=self.officer_n1,
            decision="not_resolved",
            reason="waiting on vendor",
        )
        self.assertEqual(ticket.status, GrievanceTicket.Status.NOT_RESOLVED)
        self.assertAlmostEqual(
            (ticket.reminder_due_at - timezone.now()).total_seconds(),
            7 * 86400,
            delta=120,
        )  # +7d employee cycle
        self.assertEqual(
            ticket.admin_reminder_due_at, self.admin_due_before
        )  # PRESERVED

    def test_central_not_resolved_bumps_escalation_stream_only(self):
        """Old line 269-270 — admin's +7d cycle, employee stream untouched."""
        ticket = resolve_ticket(
            ticket_id=self.ticket.pk,
            user=self.central,
            decision="not_resolved",
            reason="club unresponsive",
        )
        self.assertAlmostEqual(
            (ticket.admin_reminder_due_at - timezone.now()).total_seconds(),
            7 * 86400,
            delta=120,
        )
        self.assertEqual(ticket.reminder_due_at, self.reminder_before)

    def test_double_resolve_rejected(self):
        resolve_ticket(
            ticket_id=self.ticket.pk, user=self.officer_n1, decision="resolved"
        )
        with self.assertRaises(GrievanceError) as ctx:
            resolve_ticket(
                ticket_id=self.ticket.pk, user=self.officer_n1, decision="not_resolved"
            )
        self.assertEqual(str(ctx.exception), "illegal_transition")

    def test_invalid_decision_rejected(self):
        with self.assertRaises(GrievanceError) as ctx:
            resolve_ticket(
                ticket_id=self.ticket.pk, user=self.officer_n1, decision="postpone"
            )
        self.assertEqual(str(ctx.exception), "invalid_decision")

    def test_resolution_writes_sla_event_and_audit(self):
        ticket = resolve_ticket(
            ticket_id=self.ticket.pk,
            user=self.officer_n1,
            decision="resolved",
            reason="done",
        )
        self.assertTrue(ticket.sla_events.filter(kind=SLAEvent.Kind.RESOLVED).exists())
        self.assertTrue(
            AuditLog.objects.filter(
                action="grievance.resolved", object_id=str(ticket.pk)
            ).exists()
        )


class ScopingTests(GrievanceFixture):
    """P0/P4: queryset-level zone scoping — cross-zone rows look missing."""

    # Fixture attributes created in setUpTestData/setUp (declared for mypy).
    ticket_n1: Any
    ticket_w1: Any

    def setUp(self):
        self.ticket_n1 = create_ticket(
            raised_by=self.president, club=self.club_n1, subject="n1", description=""
        )
        # W1 club + authority for the cross-zone fixture.
        AuthorityAssignment.objects.create(
            user=self.outsider,
            club=self.club_w1,
            tier=AuthorityAssignment.Tier.SECRETARY,
            from_date=timezone.now().date(),
            status=AuthorityAssignment.Status.ACTIVE,
        )
        self.ticket_w1 = create_ticket(
            raised_by=self.outsider, club=self.club_w1, subject="w1", description=""
        )

    def test_queue_scoped_to_own_zone(self):
        rows = list(queue_for(self.officer_n1))
        self.assertEqual(rows, [self.ticket_n1])

    def test_central_sees_all_zones(self):
        self.assertEqual(queue_for(self.central).count(), 2)

    def test_cross_zone_resolve_is_not_found(self):
        with self.assertRaises(GrievanceError) as ctx:
            resolve_ticket(
                ticket_id=self.ticket_w1.pk,
                user=self.officer_n1,
                decision="resolved",
            )
        self.assertEqual(str(ctx.exception), "not_found")

    def test_non_decider_rejected(self):
        with self.assertRaises(GrievanceError) as ctx:
            queue_for(self.president)
        self.assertEqual(str(ctx.exception), "not_a_decider")


class SweepTests(GrievanceFixture):
    """P5 self-healing sweeps: breaches once per cycle, escalation latched."""

    # Fixture attributes created in setUpTestData/setUp (declared for mypy).
    ticket: Any

    def setUp(self):
        self.ticket = create_ticket(
            raised_by=self.president, club=self.club_n1, subject="sweep", description=""
        )

    def test_due_reminder_records_one_breach_per_cycle(self):
        now = timezone.now()
        result = sweep(as_of=now)
        self.assertEqual(result["breaches"], 0)  # not due yet (72h)
        future = now + timedelta(hours=73)
        self.assertEqual(sweep(as_of=future)["breaches"], 1)
        self.assertEqual(sweep(as_of=future)["breaches"], 0)  # idempotent

    def test_escalation_fires_once_at_30d(self):
        now = timezone.now()
        self.assertEqual(sweep(as_of=now + timedelta(days=29))["escalations"], 0)
        late = now + timedelta(days=31)
        self.assertEqual(sweep(as_of=late)["escalations"], 1)
        self.assertEqual(sweep(as_of=late)["escalations"], 0)  # latched
        self.ticket.refresh_from_db()
        self.assertTrue(self.ticket.is_admin_escalated)
        self.assertTrue(
            self.ticket.sla_events.filter(kind=SLAEvent.Kind.ESCALATION).exists()
        )

    def test_escalation_requires_30d_age_even_if_due(self):
        # Old guard: due AND >= 30d unresolved (get_admin_reminders).
        now = timezone.now()
        self.ticket.admin_reminder_due_at = now - timedelta(hours=1)
        self.ticket.save(update_fields=["admin_reminder_due_at"])
        self.assertEqual(sweep(as_of=now)["escalations"], 0)

    def test_resolved_ticket_never_escalates(self):
        resolve_ticket(
            ticket_id=self.ticket.pk, user=self.officer_n1, decision="resolved"
        )
        late = timezone.now() + timedelta(days=40)
        self.assertEqual(sweep(as_of=late)["escalations"], 0)
        self.assertEqual(sweep(as_of=late)["breaches"], 0)


class SlaClockTests(TestCase):
    """C3: office hours Mon-Fri 09:00-18:00 (Asia/Kolkata)."""

    def test_office_hours_window(self):
        from datetime import datetime

        tz = sla.tz()
        monday_noon = datetime(2026, 10, 26, 12, 0, tzinfo=tz)
        saturday = datetime(2026, 10, 24, 12, 0, tzinfo=tz)  # Sat
        monday_night = datetime(2026, 10, 26, 20, 0, tzinfo=tz)
        self.assertTrue(sla.is_office_hours(monday_noon))
        self.assertFalse(sla.is_office_hours(saturday))
        self.assertFalse(sla.is_office_hours(monday_night))

    def test_next_office_moment_skips_nights_and_weekends(self):
        from datetime import datetime

        tz = sla.tz()
        friday_night = datetime(2026, 10, 23, 20, 0, tzinfo=tz)  # Fri 20:00
        nxt = sla.next_office_moment(friday_night)
        self.assertEqual(nxt, datetime(2026, 10, 26, 9, 0, tzinfo=tz))  # Mon 09:00

    def test_add_office_hours_counts_office_time_only(self):
        from datetime import datetime

        tz = sla.tz()
        friday_17 = datetime(2026, 10, 23, 17, 0, tzinfo=tz)
        # 2 office hours: Fri 17:00 -> 18:00 (1h) then Mon 09:00 -> 10:00 (1h).
        self.assertEqual(
            sla.add_office_hours(friday_17, 2),
            datetime(2026, 10, 26, 10, 0, tzinfo=tz),
        )


# ---------------------------------------------------------------------------
# D3b — HTTP layer pins (thin adapters over the services above).
# Literal URL paths on purpose (same convention as the rest of the suite).
# ---------------------------------------------------------------------------

from django.conf import settings  # noqa: E402


class GrievanceAPITests(GrievanceFixture):
    """Adversarial pins for the grievances API (club side + admin dispatcher)."""

    # Fixture attributes created in setUpTestData/setUp (declared for mypy).
    president_w1: Any
    public: Any
    student: Any

    @classmethod
    def setUpTestData(cls) -> None:
        super().setUpTestData()
        cls.president_w1 = _make_user(
            "president2",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
        )
        AuthorityAssignment.objects.create(
            user=cls.president_w1,
            club=cls.club_w1,
            tier=AuthorityAssignment.Tier.PRESIDENT,
            from_date=timezone.now().date(),
            status=AuthorityAssignment.Status.ACTIVE,
        )
        cls.student = _make_user(
            "student1",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
        )
        cls.public = _make_user(
            "public1",
            category=Category.GENERAL_PUBLIC,
            sub_role=SubRole.ANONYMOUS,
        )

    def _login(self, user) -> None:
        # Mirrors CharterDeskAPITests._login — the admin gate needs MFA.
        self.client.force_login(user)
        session = self.client.session
        session["mfa_verified"] = True
        session.save()

    def _intake(
        self, club, *, subject="Power cut in lab", description="daily 6-8pm", **extra
    ):
        payload = {"club_id": club.pk, "subject": subject, "description": description}
        payload.update(extra)
        return self.client.post("/api/v1/grievances/", payload)

    # --- club intake ------------------------------------------------------

    def test_intake_happy_path_derives_zone(self):
        self._login(self.president)
        resp = self._intake(self.club_n1)
        self.assertEqual(resp.status_code, 201)
        ticket = GrievanceTicket.objects.get()
        self.assertEqual(ticket.club, self.club_n1)
        self.assertEqual(ticket.raised_by, self.president)
        self.assertEqual(ticket.status, GrievanceTicket.Status.OPEN)
        self.assertEqual(ticket.state_code, "UP")
        self.assertEqual(ticket.zone_code, "N1")

    def test_intake_by_non_authorities_is_403(self):
        for user in (self.student, self.public, self.outsider):
            with self.subTest(user=user.username):
                self._login(user)
                resp = self._intake(self.club_n1)
                self.assertEqual(resp.status_code, 403)
        self.assertEqual(GrievanceTicket.objects.count(), 0)

    def test_intake_for_another_club_is_403(self):
        self._login(self.president)
        resp = self._intake(self.club_w1)
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["error"], "not_club_authority")
        self.assertEqual(GrievanceTicket.objects.count(), 0)

    def test_intake_ignores_mass_assignment(self):
        self._login(self.president)
        resp = self._intake(
            self.club_n1,
            status="resolved",
            zone_code="X",
            is_admin_escalated=True,
            resolved_at="2020-01-01T00:00:00Z",
            reminder_due_at="2020-01-01T00:00:00Z",
            admin_reminder_due_at="2020-01-01T00:00:00Z",
        )
        self.assertEqual(resp.status_code, 201)
        ticket = GrievanceTicket.objects.get()
        self.assertEqual(ticket.status, GrievanceTicket.Status.OPEN)
        self.assertEqual(ticket.zone_code, "N1")
        self.assertFalse(ticket.is_admin_escalated)
        self.assertIsNone(ticket.resolved_at)
        self.assertGreater(ticket.reminder_due_at, timezone.now())

    def test_intake_empty_subject_400_and_unknown_club_404(self):
        self._login(self.president)
        resp = self._intake(self.club_n1, subject="   ")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["error"], "empty_subject")
        resp = self.client.post(
            "/api/v1/grievances/",
            {"club_id": 424242, "subject": "x", "description": "y"},
        )
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.json()["error"], "not_found")
        self.assertEqual(GrievanceTicket.objects.count(), 0)

    # --- club list / detail ----------------------------------------------

    def test_club_list_and_detail_scoped_to_own_club(self):
        own = create_ticket(
            raised_by=self.president,
            club=self.club_n1,
            subject="N1 issue",
            description="d",
        )
        other = create_ticket(
            raised_by=self.president_w1,
            club=self.club_w1,
            subject="W1 issue",
            description="d",
        )
        self._login(self.president)
        resp = self.client.get("/api/v1/grievances/")
        self.assertEqual(resp.status_code, 200)
        ids = [row["id"] for row in resp.json()["results"]]
        self.assertIn(str(own.pk), ids)
        self.assertNotIn(str(other.pk), ids)

        resp = self.client.get(f"/api/v1/grievances/{other.pk}/")
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.json()["error"], "not_found")

        resp = self.client.get(f"/api/v1/grievances/{own.pk}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["sla_events"], [])

    # --- admin dispatcher: zone scoping -----------------------------------

    def test_admin_queue_zone_scoping(self):
        n1 = create_ticket(
            raised_by=self.president,
            club=self.club_n1,
            subject="N1 issue",
            description="d",
        )
        w1 = create_ticket(
            raised_by=self.president_w1,
            club=self.club_w1,
            subject="W1 issue",
            description="d",
        )
        self._login(self.officer_n1)
        resp = self.client.get("/admin/api/v1/grievances/queue/")
        self.assertEqual(resp.status_code, 200)
        ids = [row["id"] for row in resp.json()["results"]]
        self.assertEqual(ids, [str(n1.pk)])

        self._login(self.central)
        resp = self.client.get("/admin/api/v1/grievances/queue/")
        ids = [row["id"] for row in resp.json()["results"]]
        self.assertCountEqual(ids, [str(n1.pk), str(w1.pk)])

    def test_cross_zone_resolve_is_404_and_touches_nothing(self):
        w1 = create_ticket(
            raised_by=self.president_w1,
            club=self.club_w1,
            subject="W1 issue",
            description="d",
        )
        self._login(self.officer_n1)
        resp = self.client.post(
            f"/admin/api/v1/grievances/{w1.pk}/resolve/",
            {"decision": "resolved", "reason": "sneaky"},
        )
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.json()["error"], "not_found")
        w1.refresh_from_db()
        self.assertEqual(w1.status, GrievanceTicket.Status.OPEN)
        self.assertIsNone(w1.resolved_at)
        self.assertIsNone(w1.resolved_by)
        self.assertEqual(w1.sla_events.count(), 0)

    # --- resolve semantics -------------------------------------------------

    def test_resolve_resolved_closes_and_ignores_extra_body_fields(self):
        ticket = create_ticket(
            raised_by=self.president,
            club=self.club_n1,
            subject="N1 issue",
            description="d",
        )
        self._login(self.officer_n1)
        resp = self.client.post(
            f"/admin/api/v1/grievances/{ticket.pk}/resolve/",
            {"decision": "resolved", "reason": "fixed", "status": "open"},
        )
        self.assertEqual(resp.status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, GrievanceTicket.Status.RESOLVED)
        self.assertEqual(ticket.resolved_by, self.officer_n1)
        self.assertIsNotNone(ticket.resolved_at)
        self.assertEqual(
            ticket.sla_events.filter(kind=SLAEvent.Kind.RESOLVED).count(), 1
        )
        # SLA ledger rows expose kind/occurred_at/note only.
        self._login(self.officer_n1)
        resp = self.client.get(f"/admin/api/v1/grievances/{ticket.pk}/")
        events = resp.json()["sla_events"]
        self.assertEqual(len(events), 1)
        self.assertEqual(set(events[0]), {"kind", "occurred_at", "note"})

    def test_resolve_not_resolved_bumps_reminder_only(self):
        ticket = create_ticket(
            raised_by=self.president,
            club=self.club_n1,
            subject="N1 issue",
            description="d",
        )
        before_admin = ticket.admin_reminder_due_at
        self._login(self.officer_n1)
        resp = self.client.post(
            f"/admin/api/v1/grievances/{ticket.pk}/resolve/",
            {"decision": "not_resolved", "reason": "still broken"},
        )
        self.assertEqual(resp.status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, GrievanceTicket.Status.NOT_RESOLVED)
        # The 30-day escalation anchor is NEVER postponed (old line 275).
        self.assertEqual(ticket.admin_reminder_due_at, before_admin)
        cycle = timedelta(days=cast(int, settings.GRIEVANCE_SLA["CYCLE_DAYS"]))
        drift = (ticket.reminder_due_at - timezone.now()) - cycle
        self.assertLess(abs(drift), timedelta(minutes=5))
        self.assertEqual(
            ticket.sla_events.filter(kind=SLAEvent.Kind.NOT_RESOLVED).count(), 1
        )

    # --- sweep --------------------------------------------------------------

    def test_sweep_central_only_counts_and_idempotent(self):
        ticket = create_ticket(
            raised_by=self.president,
            club=self.club_n1,
            subject="sweep me",
            description="d",
        )
        GrievanceTicket.objects.filter(pk=ticket.pk).update(
            created_at=timezone.now() - timedelta(days=45),
            reminder_due_at=timezone.now() - timedelta(days=1),
            admin_reminder_due_at=timezone.now() - timedelta(days=1),
        )
        self._login(self.officer_n1)
        resp = self.client.post("/admin/api/v1/grievances/sweep/", {})
        self.assertEqual(resp.status_code, 403)

        self._login(self.central)
        resp = self.client.post("/admin/api/v1/grievances/sweep/", {})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"breaches": 1, "escalations": 1})
        resp = self.client.post("/admin/api/v1/grievances/sweep/", {})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"breaches": 0, "escalations": 0})

    # --- the door -----------------------------------------------------------

    def test_unauthenticated_blocked_everywhere(self):
        endpoints = [
            ("get", "/api/v1/grievances/"),
            ("post", "/api/v1/grievances/"),
            ("get", "/api/v1/grievances/11111111-1111-1111-1111-111111111111/"),
            ("get", "/admin/api/v1/grievances/queue/"),
            ("get", "/admin/api/v1/grievances/11111111-1111-1111-1111-111111111111/"),
            (
                "post",
                "/admin/api/v1/grievances/"
                "11111111-1111-1111-1111-111111111111/resolve/",
            ),
            ("post", "/admin/api/v1/grievances/sweep/"),
        ]
        for method, url in endpoints:
            with self.subTest(url=url):
                caller = getattr(self.client, method)
                resp = caller(url, {}) if method == "post" else caller(url)
                self.assertIn(resp.status_code, (401, 403))
