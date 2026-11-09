"""Per-app unit pins for the Members app (M4 D3).

The database-level promises of ``JoinRequest``: one pending request per
(user, club), and scope keys identical to ``domain.Membership`` so the M1
policy layer scopes both tables the same way (I5).
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.domain.models import Membership

from .models import JoinRequest


class JoinRequestModelTests(TestCase):
    def test_scope_lookups_mirror_membership(self) -> None:
        self.assertEqual(JoinRequest.SCOPE_LOOKUPS, Membership.SCOPE_LOOKUPS)

    def test_only_one_pending_request_per_user_and_club(self) -> None:
        from django.contrib.auth import get_user_model

        from apps.domain.models import Club, Institution, State, Zone

        zone = Zone.objects.create(code="M1", name="Members zone")
        state = State.objects.create(code="M1S", name="Members state", zone=zone)
        institution = Institution.objects.create(
            code="M1I", legacy_id="LEG-M1I", name="Members institution", state=state
        )
        club = Club.objects.create(
            code="M1C", institution=institution, name="Members club"
        )
        user = get_user_model().objects.create_user(
            username="m1joiner", password="x" * 12
        )
        JoinRequest.objects.create(user=user, club=club)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                JoinRequest.objects.create(user=user, club=club)
        # Once decided, a NEW request is allowed again (re-request after
        # rejection/approval must not deadlock the roster).
        row = JoinRequest.objects.get()
        row.status = JoinRequest.Status.REJECTED
        row.save(update_fields=["status"])
        fresh = JoinRequest.objects.create(user=user, club=club)
        self.assertEqual(fresh.status, JoinRequest.Status.PENDING)



class OversightNotificationTests(TestCase):
    def setUp(self) -> None:
        from django.contrib.auth import get_user_model

        from apps.accounts.models import AccountState, Category, SubRole
        from apps.domain.models import Club, Institution, OfficerAssignment, State, Zone

        self.zone = Zone.objects.create(code="NZ", name="North Zone")
        self.state = State.objects.create(
            code="UP", name="Uttar Pradesh", zone=self.zone
        )
        self.institution = Institution.objects.create(
            code="BHU_INST",
            legacy_id="LEG-BHU",
            name="Banaras Hindu University",
            state=self.state,
        )
        self.club = Club.objects.create(
            code="BHU_CLUB",
            institution=self.institution,
            name="Banaras Hindu University Club",
        )
        self.officer = get_user_model().objects.create_user(
            username="EMP01",
            password="x" * 12,
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            email="emp01@ndli.iitkgp.ac.in",
            account_state=AccountState.ACTIVE,
        )
        from datetime import date
        OfficerAssignment.objects.create(
            state=self.state,
            officer=self.officer,
            from_date=date(2026, 1, 1),
        )
        self.president = get_user_model().objects.create_user(
            username="bhu_president",
            password="x" * 12,
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            institution=self.institution,
            club=self.club,
        )
        self.student = get_user_model().objects.create_user(
            username="bhu_student",
            password="x" * 12,
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            institution=self.institution,
            club=self.club,
        )

    def test_notification_read_persistence(self) -> None:
        from datetime import date

        from rest_framework.test import APIClient

        from apps.members.services import generate_club_oversight_notifications

        client = APIClient()
        client.force_authenticate(user=self.president)

        notif_id = f"notif-renewal-due-{self.club.code}"
        # Before mark read
        notifs = generate_club_oversight_notifications(
            club=self.club,
            days_remaining=20,
            upcoming_renewal_date=date(2026, 12, 31),
            user=self.president,
        )
        target_notif = next((n for n in notifs if n["id"] == notif_id), None)
        self.assertIsNotNone(target_notif)
        assert target_notif is not None
        self.assertFalse(target_notif["read"])

        # Mark read via API
        resp = client.post(
            "/api/v1/members/notifications/mark-read/",
            {"notification_ids": [notif_id]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        # After mark read (simulating browser reload)
        notifs_after = generate_club_oversight_notifications(
            club=self.club,
            days_remaining=20,
            upcoming_renewal_date=date(2026, 12, 31),
            user=self.president,
        )
        target_after = next((n for n in notifs_after if n["id"] == notif_id), None)
        self.assertIsNotNone(target_after)
        assert target_after is not None
        self.assertTrue(target_after["read"])

    def test_notification_acknowledge_seal_pushes_to_nodal_officer_desk(self) -> None:
        from rest_framework.test import APIClient

        from apps.activities.models import ActivityLog
        from apps.audit.models import AuditLog

        client = APIClient()
        client.force_authenticate(user=self.president)

        resp = client.post(
            "/api/v1/members/notifications/acknowledge/",
            {
                "notification_id": f"notif-charter-{self.club.code}",
                "title": "Official Club Charter Approved",
                "description": "Charter certified by IIT Kharagpur.",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["acknowledged"])
        self.assertEqual(resp.data["officer_emp_id"], "EMP01")

        # SSOT Architectural Verification: ActivityLog MUST NOT be polluted
        self.assertFalse(
            ActivityLog.objects.filter(
                employee=self.officer, club_code=self.club.code
            ).exists()
        )

        # Verify AuditLog row created (authoritative single source)
        audit_row = AuditLog.objects.filter(
            action="oversight.seal.acknowledged", actor_id=self.president.pk
        ).first()
        self.assertIsNotNone(audit_row)
        assert audit_row is not None
        self.assertEqual(audit_row.detail.get("officer_emp_id"), "EMP01")
        self.assertEqual(audit_row.detail.get("club_code"), self.club.code)

        # Verify Officer's inbound notifications endpoint returns the item
        officer_client = APIClient()
        officer_client.force_authenticate(user=self.officer)
        session = officer_client.session
        session["mfa_verified"] = True
        session.save()
        notif_resp = officer_client.get(
            "/admin/api/v1/activities/notifications/?emp_id=EMP01"
        )
        self.assertEqual(notif_resp.status_code, 200)
        self.assertGreaterEqual(notif_resp.data["count"], 1)
        notif_item = notif_resp.data["notifications"][0]
        self.assertIn("Seal Acknowledged", notif_item["title"])
        self.assertEqual(notif_item["club_code"], self.club.code)
        self.assertEqual(notif_item["type"], "approval")

    def test_unauthorized_student_cannot_acknowledge(self) -> None:
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(user=self.student)

        resp = client.post(
            "/api/v1/members/notifications/acknowledge/",
            {"notification_id": "test-id", "title": "Seal"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
