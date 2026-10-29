"""M6 D8 -- employee activity log pins (PLAN_0018_DUAL_LAYER.md section 6).

Parity with the previous project's activity semantics (SEC A logging, bulk
phone-call entries, list scoping, bulk-group delete-in-full) plus the owner
rule: club-approval log rows are delete-protected for employees and the
protection is SERVER-enforced (whole request rejected, no partial deletes).
AUTH-TURF: the business-admin override is the Central Admin house only.
"""
from __future__ import annotations

import uuid
from typing import Any, ClassVar

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import AccountState, Category, SubRole
from apps.activities.models import ActivityLog, SupportType

User = get_user_model()

LIST_URL = "/admin/api/v1/activities/"
LOG_URL = "/admin/api/v1/activities/log/"
DELETE_URL = "/admin/api/v1/activities/delete/"
PASSWORD = "S3cure-test-pass!"


def _user(
    username: str,
    sub_role: str,
    account_state: str = AccountState.ACTIVE,
):
    return User.objects.create_user(
        username=username,
        email=f"{username}@example.test",
        password=PASSWORD,
        category=Category.IIT_KGP_ADMIN,
        sub_role=sub_role,
        account_state=account_state,
    )


class ActivityLogEndpointTests(TestCase):
    emp: ClassVar[Any]
    emp2: ClassVar[Any]
    central: ClassVar[Any]
    superops: ClassVar[Any]
    @classmethod
    def setUpTestData(cls) -> None:
        cls.emp = _user("emp01", SubRole.REGIONAL_OFFICER)
        cls.emp2 = _user("emp02", SubRole.REGIONAL_OFFICER)
        cls.central = _user("centraladm", SubRole.CENTRAL_ADMIN)
        cls.superops = _user("superops", SubRole.SUPER_ADMIN_OPS)

    def setUp(self) -> None:
        self.client = APIClient()

    def _auth(self, user: object) -> None:
        self.client.force_authenticate(user=user)  # type: ignore[attr-defined]
        session = self.client.session
        session["mfa_verified"] = True
        session.save()

    # --- SEC A logging ------------------------------------------------
    def test_sec_a_log_creates_standard_row(self) -> None:
        self._auth(self.emp)
        response = self.client.post(
            LOG_URL,
            {
                "support_type": "Closing of OS Ticket",
                "notes": "T-1 resolved",
                "club_id": "NDLI-DL-102",
            },
        )
        self.assertEqual(response.status_code, 200)
        row = ActivityLog.objects.get()
        self.assertEqual(row.support_type, SupportType.OS_TICKET)
        self.assertFalse(row.priority_flag)
        self.assertEqual(row.club_code, "NDLI-DL-102")
        self.assertEqual(row.employee, self.emp)

    def test_bulk_only_for_phone_call_type(self) -> None:
        self._auth(self.emp)
        response = self.client.post(
            LOG_URL, {"support_type": "Online training", "count": 5}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ActivityLog.objects.count(), 1)

        response = self.client.post(
            LOG_URL,
            {
                "support_type": "Phone call and remote assistance",
                "count": 5,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ActivityLog.objects.count(), 2)
        bulk_row = ActivityLog.objects.filter(
            support_type=SupportType.PHONE_CALL
        ).first()
        assert bulk_row is not None
        self.assertEqual(bulk_row.call_count, 5)

    def test_bulk_capped_at_100(self) -> None:
        self._auth(self.emp)
        response = self.client.post(
            LOG_URL,
            {
                "support_type": "Phone call and remote assistance",
                "count": 500,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 100)

    def test_auto_and_unknown_support_types_rejected(self) -> None:
        self._auth(self.emp)
        for bad in ("Club Approval", "Registration Renewal", "Something else", ""):
            response = self.client.post(LOG_URL, {"support_type": bad})
            self.assertEqual(response.status_code, 400, bad)

    def test_blocked_employee_cannot_log(self) -> None:
        blocked = _user("emp99", SubRole.REGIONAL_OFFICER, AccountState.LOCKED)
        self._auth(blocked)
        response = self.client.post(LOG_URL, {"support_type": "Online training"})
        self.assertEqual(response.status_code, 403)

    # --- list scoping -------------------------------------------------
    def test_list_is_self_scoped(self) -> None:
        ActivityLog.objects.create(
            employee=self.emp, support_type=SupportType.OS_TICKET
        )
        self._auth(self.emp2)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.json()["count"], 0)
        response = self.client.get(LIST_URL, {"emp_id": "emp01"})
        self.assertEqual(response.status_code, 403)

    def test_central_admin_may_list_any(self) -> None:
        ActivityLog.objects.create(
            employee=self.emp, support_type=SupportType.OS_TICKET
        )
        self._auth(self.central)
        response = self.client.get(LIST_URL, {"emp_id": "emp01"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)

    # --- delete protection (owner rule, PLAN section 6) ---------------
    def test_employee_cannot_delete_approval_log(self) -> None:
        row = ActivityLog.objects.create(
            employee=self.emp,
            support_type=SupportType.CLUB_APPROVAL,
            club_code="NDLI-DL-102",
        )
        self.assertTrue(row.priority_flag)
        self._auth(self.emp)
        response = self.client.post(
            DELETE_URL,
            {"emp_id": "emp01", "activity_ids": [str(row.activity_id)]},
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(ActivityLog.objects.filter(pk=row.pk).exists())

    def test_approval_delete_rejects_whole_request(self) -> None:
        normal = ActivityLog.objects.create(
            employee=self.emp, support_type=SupportType.OS_TICKET
        )
        approval = ActivityLog.objects.create(
            employee=self.emp, support_type=SupportType.REGISTRATION_RENEWAL
        )
        self._auth(self.emp)
        response = self.client.post(
            DELETE_URL,
            {
                "emp_id": "emp01",
                "activity_ids": [
                    str(normal.activity_id),
                    str(approval.activity_id),
                ],
            },
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(ActivityLog.objects.count(), 2)

    def test_employee_deletes_own_normal_entry(self) -> None:
        row = ActivityLog.objects.create(
            employee=self.emp, support_type=SupportType.OS_TICKET
        )
        self._auth(self.emp)
        response = self.client.post(
            DELETE_URL,
            {"emp_id": "emp01", "activity_id": str(row.activity_id)},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ActivityLog.objects.count(), 0)

    def test_employee_deletes_without_explicit_emp_id(self) -> None:
        row = ActivityLog.objects.create(
            employee=self.emp, support_type=SupportType.OS_TICKET
        )
        self._auth(self.emp)
        response = self.client.post(
            DELETE_URL,
            {"activity_ids": [str(row.activity_id)]},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ActivityLog.objects.count(), 0)

    def test_bulk_entry_deletes_in_full(self) -> None:
        group_id = uuid.uuid4()
        rows = [
            ActivityLog.objects.create(
                employee=self.emp,
                support_type=SupportType.PHONE_CALL,
                bulk_group=group_id,
            )
            for _ in range(3)
        ]
        self._auth(self.emp)
        response = self.client.post(
            DELETE_URL,
            {"emp_id": "emp01", "activity_ids": [str(rows[0].activity_id)]},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["deleted_count"], 3)
        self.assertEqual(ActivityLog.objects.count(), 0)

    def test_central_admin_may_delete_approval_log(self) -> None:
        row = ActivityLog.objects.create(
            employee=self.emp, support_type=SupportType.CLUB_APPROVAL
        )
        self._auth(self.central)
        response = self.client.post(
            DELETE_URL,
            {"emp_id": "emp01", "activity_ids": [str(row.activity_id)]},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ActivityLog.objects.count(), 0)

    def test_other_employee_cannot_delete_my_rows(self) -> None:
        row = ActivityLog.objects.create(
            employee=self.emp, support_type=SupportType.OS_TICKET
        )
        self._auth(self.emp2)
        response = self.client.post(
            DELETE_URL,
            {"emp_id": "emp01", "activity_ids": [str(row.activity_id)]},
        )
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_rejected(self) -> None:
        response = self.client.get(LIST_URL)
        self.assertIn(response.status_code, (401, 403))

    def test_activity_export_csv(self) -> None:
        ActivityLog.objects.create(
            employee=self.emp,
            support_type=SupportType.PHONE_CALL,
            notes="Call with college principal",
            call_count=3,
        )
        self._auth(self.emp)
        response = self.client.get("/admin/api/v1/activities/export/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])
        self.assertIn("Call with college principal", response.content.decode("utf-8"))
        self.assertIn("3", response.content.decode("utf-8"))

    def test_clubs_export_csv(self) -> None:
        self._auth(self.emp)
        response = self.client.get("/admin/api/v1/activities/clubs-export/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])

    def test_pi_signature_settings(self) -> None:
        self._auth(self.emp)
        post_res = self.client.post(
            "/admin/api/v1/activities/pi-signature-settings/",
            {"pi_affiliation": "Prof. CSE, IIT Kharagpur"},
        )
        self.assertEqual(post_res.status_code, 200)
        self.assertTrue(post_res.json()["success"])

        get_res = self.client.get("/admin/api/v1/activities/pi-signature-settings/")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["pi_affiliation"], "Prof. CSE, IIT Kharagpur")

    def test_master_clubs_csv(self) -> None:
        self._auth(self.central)
        response = self.client.get("/admin/api/v1/data/master-csv/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])
        header_line = response.content.decode("utf-8").splitlines()[0]
        self.assertIn("Club ID", header_line)
        self.assertIn("Solo Activities", header_line)
        self.assertIn("Joint Cross-Campus Activities (Inter-Club Shield)", header_line)

    def test_local_backups(self) -> None:
        self._auth(self.superops)
        create_res = self.client.post(
            "/admin/api/v1/data/local-backups/",
            {"notes": "Test DevOps Backup"},
        )
        self.assertEqual(create_res.status_code, 200)
        self.assertTrue(create_res.json()["success"])

        list_res = self.client.get("/admin/api/v1/data/local-backups/")
        self.assertEqual(list_res.status_code, 200)
        self.assertTrue(len(list_res.json()["backups"]) >= 1)
