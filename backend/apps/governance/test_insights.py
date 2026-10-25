"""M6 D5 MCC insights tests — read-only report + RBAC (P0: MCC-only)."""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import AccountState, Category, SubRole
from apps.domain.models import Club, Institution, State, Zone

User = get_user_model()
REPORT_URL = "/admin/api/v1/governance/insights/report/"


class InsightsReportTests(TestCase):
    """Strategic report: derivation + audience (MCC = master control only)."""

    @classmethod
    def setUpTestData(cls) -> None:
        cls.zone_n1 = Zone.objects.create(code="N1", name="North 1")
        cls.zone_w1 = Zone.objects.create(code="W1", name="West 1")
        cls.state_rep = State.objects.create(
            code="UP", name="Uttar Pradesh", zone=cls.zone_n1
        )
        cls.state_empty = State.objects.create(
            code="BR", name="Bihar", zone=cls.zone_n1
        )
        cls.inst = Institution.objects.create(
            code="INST-1", legacy_id="LEG-1", name="Rep Institute", state=cls.state_rep
        )
        cls.club = Club.objects.create(
            code="CLUB-1", institution=cls.inst, name="Rep Club"
        )
        cls.central = User.objects.create_user(
            username="centraladm",
            email="centraladm@example.test",
            password="Str0ng-P4ss!",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
            account_state=AccountState.ACTIVE,
        )
        cls.emp03 = User.objects.create_user(
            username="emp03",
            email="emp03@example.test",
            password="Str0ng-P4ss!",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code=cls.zone_n1.code,
            account_state=AccountState.ACTIVE,
        )

    def setUp(self) -> None:
        self.client = APIClient()

    def _login(self, user) -> None:
        self.client.force_authenticate(user=user)
        session = self.client.session
        session["mfa_verified"] = True
        session.save()

    def test_report_shape_and_derivation(self) -> None:
        self._login(self.central)
        response = self.client.get(REPORT_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data["metrics"]["total_clubs"], 1)
        self.assertIn("BR", data["penetration"]["unrepresented_states"])
        self.assertNotIn("UP", data["penetration"]["unrepresented_states"])
        self.assertEqual(data["penetration"]["clubs_by_state"]["UP"], 1)
        self.assertEqual(len(data["roadmap"]), 3)
        self.assertEqual(
            [h["horizon_days"] for h in data["roadmap"]], [30, 90, 365]
        )
        self.assertTrue(data["strategic_recommendations"])

    def test_renewal_horizon_counts(self) -> None:
        # Age the club to 15 days before its first anniversary -> within_30d.
        Club.objects.filter(pk=self.club.pk).update(
            created_at=timezone.now() - timedelta(days=350)
        )
        self._login(self.central)
        response = self.client.get(REPORT_URL)
        health = response.data["renewal_health"]
        self.assertEqual(health["within_30d"], 1)
        self.assertEqual(health["attention_count"], 1)

    def test_emp_cannot_read_strategic_report(self) -> None:
        # MCC parity: EMPs get operational desks, not the strategic report.
        self._login(self.emp03)
        response = self.client.get(REPORT_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_is_rejected(self) -> None:
        response = self.client.get(REPORT_URL)
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
