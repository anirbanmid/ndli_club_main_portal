"""Employee Management duty endpoints (M6 D5) — the multi-select backend.

Client change (2026-10-25): duty is a SET of States/UTs held in
``domain.OfficerAssignment`` rows. Pins cover the door (master roles only,
separation of duties), the replace semantics (kept rows untouched, no
inverted windows), the audit row, and THE client requirement: routing
re-points on the very next request.
"""

from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts import routing
from apps.accounts.models import AccountState, Category, SubRole
from apps.audit.models import AuditLog
from apps.domain.models import OfficerAssignment, State
from tests.support import attach_duty, ensure_state

User = get_user_model()

URL = "/admin/api/v1/employees/"
STATES_URL = f"{URL}states/"


def _login(client: APIClient, user: Any) -> None:
    """Same seam as the other admin-module suites: the admin door needs MFA."""
    client.force_authenticate(user=user)
    session = client.session
    session["mfa_verified"] = True
    session.save()


class EmployeeDutyApiTests(TestCase):
    # Fixture attributes created in setUpTestData/setUp (declared for mypy).
    client: Any
    master: Any
    officer: Any
    colleague: Any
    up: State
    br: State
    wb: State

    @classmethod
    def setUpTestData(cls) -> None:
        cls.up = ensure_state("UP", "N1")
        cls.br = ensure_state("BR", "E1")
        cls.wb = ensure_state("WB", "E1")
        cls.master = User.objects.create_user(
            username="master",
            email="master@example.test",
            password="master-pass-1",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
            account_state=AccountState.ACTIVE,
        )
        cls.officer = User.objects.create_user(
            username="emp-north",
            email="north@example.test",
            password="officer-pass-1",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            account_state=AccountState.ACTIVE,
        )
        cls.colleague = User.objects.create_user(
            username="emp-east",
            email="east@example.test",
            password="officer-pass-2",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            account_state=AccountState.ACTIVE,
        )

    def setUp(self) -> None:
        self.client = APIClient()

    def _duty_url(self, officer: Any) -> str:
        return f"{URL}{officer.pk}/duty/"

    # ---- the door -----------------------------------------------------

    def test_anonymous_is_rejected(self) -> None:
        response = self.client.get(URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_door_requires_mfa(self) -> None:
        self.client.force_authenticate(user=self.master)
        response = self.client.get(URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_regional_officer_can_view_but_not_edit(self) -> None:
        """Owner decision 05:45: officers SEE who handles which states
        (coordination), but separation of duties still forbids editing
        their own assignment."""
        attach_duty(self.officer, "UP")
        _login(self.client, self.officer)
        self.assertEqual(self.client.get(URL).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(STATES_URL).status_code, status.HTTP_200_OK)
        response = self.client.put(
            self._duty_url(self.officer), {"states": []}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ---- reads --------------------------------------------------------

    def test_list_employees_shows_duty_sets(self) -> None:
        attach_duty(self.officer, "UP", "BR")
        _login(self.client, self.master)
        response = self.client.get(URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = {row["username"]: row for row in response.json()["results"]}
        self.assertEqual(rows["emp-north"]["state_codes"], ["BR", "UP"])
        self.assertEqual([s["code"] for s in rows["emp-north"]["states"]], ["BR", "UP"])
        self.assertEqual(rows["emp-east"]["state_codes"], [])

    def test_states_endpoint_is_the_dropdown_source(self) -> None:
        _login(self.client, self.master)
        response = self.client.get(STATES_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        codes = [row["code"] for row in response.json()["results"]]
        self.assertEqual(codes, ["BR", "UP", "WB"])

    # ---- the multi-select save ---------------------------------------

    def test_put_replaces_the_duty_set_and_reroutes(self) -> None:
        attach_duty(self.officer, "UP", "BR")
        _login(self.client, self.master)
        response = self.client.put(
            self._duty_url(self.officer),
            {"states": ["br", "wb"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.json()
        self.assertEqual(payload["state_codes"], ["BR", "WB"])
        self.assertEqual(payload["added"], ["WB"])
        self.assertEqual(payload["removed"], ["UP"])
        # THE client requirement: the very next request routes by the new set.
        self.assertIsNone(routing.responsible_officer("UP"))
        self.assertEqual(routing.responsible_officer("WB"), self.officer.username)
        self.assertEqual(routing.responsible_officer("BR"), self.officer.username)

    def test_kept_rows_are_untouched(self) -> None:
        attach_duty(self.officer, "UP", "BR")
        before = OfficerAssignment.objects.get(
            state__code="BR", officer=self.officer
        ).pk
        _login(self.client, self.master)
        self.client.put(
            self._duty_url(self.officer),
            {"states": ["BR", "WB"]},
            format="json",
        )
        after = OfficerAssignment.objects.get(state__code="BR", officer=self.officer)
        self.assertEqual(after.pk, before)
        self.assertIsNone(after.to_date)

    def test_same_day_remove_and_readd_reopens_the_window(self) -> None:
        _login(self.client, self.master)
        url = self._duty_url(self.officer)
        self.client.put(url, {"states": ["UP"]}, format="json")
        self.client.put(url, {"states": []}, format="json")
        self.client.put(url, {"states": ["UP"]}, format="json")
        rows = OfficerAssignment.objects.filter(officer=self.officer, state__code="UP")
        self.assertEqual(rows.count(), 1)  # no inverted/duplicate windows
        self.assertIsNone(rows.get().to_date)
        self.assertEqual(routing.responsible_officer("UP"), self.officer.username)

    def test_duty_replace_writes_the_audit_row(self) -> None:
        attach_duty(self.officer, "UP")
        _login(self.client, self.master)
        self.client.put(self._duty_url(self.officer), {"states": ["WB"]}, format="json")
        row = AuditLog.objects.get(action="employee.duty.replaced")
        self.assertEqual(row.detail["officer"], self.officer.username)
        self.assertEqual(row.detail["added"], ["WB"])
        self.assertEqual(row.detail["removed"], ["UP"])

    # ---- validation ---------------------------------------------------

    def test_unknown_codes_are_rejected(self) -> None:
        _login(self.client, self.master)
        response = self.client.put(
            self._duty_url(self.officer), {"states": ["XX"]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_states_must_be_a_list(self) -> None:
        _login(self.client, self.master)
        response = self.client.put(
            self._duty_url(self.officer), {"states": "UP"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_or_non_officer_target_is_404(self) -> None:
        _login(self.client, self.master)
        missing = self.client.put(f"{URL}999999/duty/", {"states": []}, format="json")
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)
        not_officer = self.client.put(
            self._duty_url(self.master), {"states": []}, format="json"
        )
        self.assertEqual(not_officer.status_code, status.HTTP_404_NOT_FOUND)
