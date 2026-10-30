"""Tests for the Single Source of Truth (SSOT) Ledger Integrity Engine."""

from __future__ import annotations

from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Category, SubRole, User
from apps.activities.models import ActivityLog, SupportType
from apps.domain.integrity import LedgerIntegrityEngine, LedgerIntegrityError
from apps.domain.models import (
    Club,
    District,
    Institution,
    OfficerAssignment,
    State,
    Zone,
)


class LedgerIntegrityTests(TestCase):
    def setUp(self) -> None:
        self.zone = Zone.objects.create(code="NORTH", name="North Zone")
        self.state = State.objects.create(code="DL", name="Delhi", zone=self.zone)
        self.district = District.objects.create(
            code="DL-S", name="South Delhi", state=self.state
        )

        self.officer = User.objects.create_user(
            username="EMP01",
            email="emp01@ndli.test",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            account_state="active",
        )
        self.admin = User.objects.create_user(
            username="CENTRALADM",
            email="admin@ndli.test",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
            account_state="active",
        )

        OfficerAssignment.objects.create(
            officer=self.officer,
            state=self.state,
            from_date=date(2020, 1, 1),
        )

        self.inst = Institution.objects.create(
            code="INST-TEST-001",
            legacy_id="leg-inst-01",
            name="Delhi Institute of Technology",
            state=self.state,
            district=self.district,
        )

    def test_club_creation_triggers_state_gated_activity_log(self) -> None:
        """Creating an active non-sample club must create an ActivityLog row."""
        club = Club.objects.create(
            code="CLUB-TEST-DL-01",
            institution=self.inst,
            name="Delhi Institute Club",
            status=Club.Status.ACTIVE,
        )

        log = ActivityLog.objects.filter(
            support_type=SupportType.CLUB_APPROVAL,
            club_code=club.code,
        ).first()

        self.assertIsNotNone(log, "Approval log must exist for the created club.")
        self.assertEqual(log.employee, self.officer)
        self.assertEqual(log.club_code, club.code)
        self.assertTrue(log.priority_flag)
        self.assertIn("CLUB-TEST-DL-01", log.notes)

    def test_audit_and_heal_reconciles_missing_logs(self) -> None:
        """audit_and_heal must detect clubs lacking approval logs and repair them."""
        club = Club.objects.create(
            code="CLUB-TEST-DL-02",
            institution=self.inst,
            name="Second Delhi Club",
            status=Club.Status.ACTIVE,
        )
        ActivityLog.objects.filter(club_code=club.code).delete()

        report = LedgerIntegrityEngine.audit_and_heal()
        self.assertTrue(report.healthy)

        healed_log = ActivityLog.objects.filter(
            support_type=SupportType.CLUB_APPROVAL,
            club_code=club.code,
        ).first()
        self.assertIsNotNone(healed_log)
        self.assertEqual(healed_log.employee, self.officer)

    def test_strict_gate_rejects_unassigned_state(self) -> None:
        """strict_gate=True must reject club creation if no officer is assigned."""
        unknown_zone = Zone.objects.create(code="UNKNOWN_ZONE", name="Unknown Region")
        unassigned_state = State.objects.create(
            code="XX", name="Nowhere", zone=unknown_zone
        )
        unassigned_inst = Institution.objects.create(
            code="INST-XX-001",
            legacy_id="leg-inst-xx-01",
            name="Nowhere Academy",
            state=unassigned_state,
        )
        unassigned_club = Club(
            code="CLUB-XX-01",
            institution=unassigned_inst,
            name="Nowhere Club",
        )

        with self.assertRaises(LedgerIntegrityError):
            LedgerIntegrityEngine.ensure_club_approval_log(
                unassigned_club,
                strict_gate=True,
            )

    def test_integrity_view_endpoint(self) -> None:
        """GET /admin/api/v1/activities/integrity/ must return 200 HEALTHY."""
        client = APIClient()
        client.force_authenticate(user=self.admin)
        session = client.session
        session["mfa_verified"] = True
        session.save()

        res = client.get("/admin/api/v1/activities/integrity/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data.get("status"), "HEALTHY")
        self.assertIn("total_clubs_audited", res.data)
