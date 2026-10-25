"""M6 D5 renewal desk tests — both Q1 paths, zone isolation, audit, gates.

Adversarial zone cases included (P0): an officer from another zone must get
404 (never data) on every renewal surface.
"""
from __future__ import annotations

import base64
import json
import os
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import AccountState, Category, SubRole
from apps.audit.models import AuditLog
from apps.certificates.models import Certificate, CertificateCategory
from apps.domain.models import Club, Institution, State, Zone

User = get_user_model()


class RenewalDeskAPITests(TestCase):
    """Renewal attention queue + both Q1 issuance paths (M6 D5)."""

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
            code="INST-N1",
            legacy_id="LEG-N1",
            name="N1 Institute",
            state=cls.state_n1,
        )
        cls.inst_w1 = Institution.objects.create(
            code="INST-W1",
            legacy_id="LEG-W1",
            name="W1 Institute",
            state=cls.state_w1,
        )
        cls.club_a = Club.objects.create(
            code="CLUB-A", institution=cls.inst_n1, name="Alpha Club"
        )
        cls.club_b = Club.objects.create(
            code="CLUB-B", institution=cls.inst_w1, name="Beta Club"
        )
        cls.emp03 = User.objects.create_user(
            username="emp03",
            email="emp03@example.test",
            password=None,
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code=cls.zone_n1.code,
            account_state=AccountState.ACTIVE,
        )
        cls.emp05 = User.objects.create_user(
            username="emp05",
            email="emp05@example.test",
            password=None,
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code=cls.zone_w1.code,
            account_state=AccountState.ACTIVE,
        )
        cls.central = User.objects.create_user(
            username="centraladm",
            email="centraladm@example.test",
            password=None,
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
            account_state=AccountState.ACTIVE,
        )
        cls.president_a = User.objects.create_user(
            username="president-a",
            email="president.a@example.test",
            password=None,
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            club=cls.club_a,
            account_state=AccountState.ACTIVE,
        )
        cls.president_b = User.objects.create_user(
            username="president-b",
            email="president.b@example.test",
            password=None,
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            club=cls.club_b,
            account_state=AccountState.ACTIVE,
        )

    def setUp(self) -> None:
        # The signer reads its keyring from the environment (same seam as the
        # charter tests — renewal issues a certificate).
        key = base64.b64encode(b"x" * 32).decode()
        os.environ["CERT_HMAC_KEYRING"] = json.dumps({"k1": key})
        os.environ["CERT_HMAC_ACTIVE_KEY_ID"] = "k1"
        self.addCleanup(os.environ.pop, "CERT_HMAC_KEYRING", None)
        self.addCleanup(os.environ.pop, "CERT_HMAC_ACTIVE_KEY_ID", None)
        self.client = APIClient()

    def _login(self, user) -> None:
        # Same seam as CharterDeskAPITests: admin module needs mfa_verified.
        self.client.force_authenticate(user=user)
        session = self.client.session
        session["mfa_verified"] = True
        session.save()

    # ---------- attention queue ----------

    def test_attention_queue_is_zone_scoped(self) -> None:
        # Age both clubs into the <=30d attention window (fresh clubs are
        # correctly NOT attention items).
        Club.objects.update(created_at=timezone.now() - timedelta(days=350))
        self._login(self.emp03)
        response = self.client.get("/admin/api/v1/governance/renewals/attention/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        codes = [row["club_code"] for row in response.data["results"]]
        self.assertIn("CLUB-A", codes)
        self.assertNotIn("CLUB-B", codes)

    def test_attention_central_admin_sees_all_zones(self) -> None:
        Club.objects.update(created_at=timezone.now() - timedelta(days=350))
        self._login(self.central)
        response = self.client.get("/admin/api/v1/governance/renewals/attention/")
        codes = [row["club_code"] for row in response.data["results"]]
        self.assertIn("CLUB-A", codes)
        self.assertIn("CLUB-B", codes)

    def test_attention_flags_overdue_and_expiring(self) -> None:
        # Anchor = formation + 1y. Age club A past its first anniversary and
        # club B to within the 30-day window.
        Club.objects.filter(pk=self.club_a.pk).update(
            created_at=timezone.now() - timedelta(days=800)
        )
        Club.objects.filter(pk=self.club_b.pk).update(
            created_at=timezone.now() - timedelta(days=350)
        )
        self._login(self.central)
        response = self.client.get("/admin/api/v1/governance/renewals/attention/")
        rows = {row["club_code"]: row for row in response.data["results"]}
        self.assertEqual(rows["CLUB-A"]["attention"], "overdue")
        self.assertEqual(rows["CLUB-B"]["attention"], "expiring")

    def test_due_date_is_formation_plus_one_year(self) -> None:
        from apps.governance.renewals import due_date_for

        expected = self.club_a.created_at.date()
        expected = expected.replace(year=expected.year + 1)
        self.assertEqual(due_date_for(self.club_a), expected)

    # ---------- Path B: issue directly from attention ----------

    def test_path_b_direct_issue_creates_certificate_and_audit(self) -> None:
        self._login(self.emp03)
        response = self.client.post(
            "/admin/api/v1/governance/renewals/issue/",
            {"club_code": "CLUB-A"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "issued")
        cert = Certificate.objects.get(certificate_id=response.data["certificate_id"])
        self.assertEqual(cert.category, CertificateCategory.RENEWAL)
        self.assertEqual(cert.club, self.club_a)
        # Holder rule (Path B): most senior provisioned authority.
        self.assertEqual(cert.holder, self.president_a)
        self.assertTrue(
            AuditLog.objects.filter(
                action="renewal.issue", object_id=str(response.data["id"])
            ).exists()
        )

    def test_path_b_out_of_zone_club_is_404(self) -> None:
        self._login(self.emp05)
        response = self.client.post(
            "/admin/api/v1/governance/renewals/issue/",
            {"club_code": "CLUB-A"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Certificate.objects.filter(club=self.club_a).exists())

    # ---------- Path A: club requests -> EMP issues ----------

    def test_path_a_request_then_issue(self) -> None:
        self._login(self.president_a)
        response = self.client.post(
            "/api/v1/clubs/renewal/request/", {"note": "please renew"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_id = response.data["id"]

        self._login(self.emp03)
        response = self.client.post(
            f"/admin/api/v1/governance/renewals/{request_id}/issue/"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "issued")
        # Holder rule (Path A): the requesting authority.
        cert = Certificate.objects.get(certificate_id=response.data["certificate_id"])
        self.assertEqual(cert.holder, self.president_a)

    def test_only_one_open_request_per_club(self) -> None:
        self._login(self.president_a)
        first = self.client.post(
            "/api/v1/clubs/renewal/request/", {"note": "first"}, format="json"
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post(
            "/api/v1/clubs/renewal/request/", {"note": "second"}, format="json"
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_flow_marks_rejected_and_audits(self) -> None:
        self._login(self.president_a)
        response = self.client.post(
            "/api/v1/clubs/renewal/request/", {"note": "renew"}, format="json"
        )
        request_id = response.data["id"]

        self._login(self.emp03)
        response = self.client.post(
            f"/admin/api/v1/governance/renewals/{request_id}/reject/",
            {"note": "incomplete"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "rejected")
        self.assertTrue(
            AuditLog.objects.filter(
                action="renewal.reject", object_id=str(request_id)
            ).exists()
        )

    def test_cross_zone_record_access_is_404(self) -> None:
        self._login(self.president_a)
        response = self.client.post(
            "/api/v1/clubs/renewal/request/", {"note": "renew"}, format="json"
        )
        request_id = response.data["id"]

        # The W1 officer must not see, issue, or reject an N1 row.
        self._login(self.emp05)
        issue = self.client.post(
            f"/admin/api/v1/governance/renewals/{request_id}/issue/"
        )
        self.assertEqual(issue.status_code, status.HTTP_404_NOT_FOUND)
        reject = self.client.post(
            f"/admin/api/v1/governance/renewals/{request_id}/reject/"
        )
        self.assertEqual(reject.status_code, status.HTTP_404_NOT_FOUND)
        history = self.client.get("/admin/api/v1/governance/renewals/")
        self.assertEqual(history.status_code, status.HTTP_200_OK)
        self.assertNotIn(request_id, [r["id"] for r in history.data["results"]])

    # ---------- guard rails ----------

    def test_student_member_cannot_use_the_desk(self) -> None:
        student = User.objects.create_user(
            username="student1",
            email="student1@example.test",
            password=None,
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            account_state=AccountState.ACTIVE,
        )
        self.client.force_authenticate(user=student)
        response = self.client.get("/admin/api/v1/governance/renewals/attention/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_is_rejected(self) -> None:
        response = self.client.get("/admin/api/v1/governance/renewals/attention/")
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_club_authority_needs_a_club_scope(self) -> None:
        stray = User.objects.create_user(
            username="stray",
            email="stray@example.test",
            password=None,
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.ACTIVE,
        )
        self.client.force_authenticate(user=stray)
        response = self.client.post(
            "/api/v1/clubs/renewal/request/", {"note": "hello"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
