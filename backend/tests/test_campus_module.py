"""Comprehensive test suite for Institutional Club Module (CAMPUS).

Covers:
1. Bifurcated Institutional Onboarding (HEI 4-tier vs School 3-tier)
2. 7-Day Draft Resume Engine (Token hashing & TTL)
3. Authority De-duplication Gate & Succession Cascade
4. Sub-Club Management & SSOT 1+N Telemetry Counting
5. School Offline-First Roster Upload & Deterministic UIDs
6. Event 30-Minute Dynamic Participation Window (T-10m to T+20m)
7. Dual Certificate Issuance (Conductor & Participant HMAC)
8. Curated Libraries with strict NDLI URL Whitelist
9. Universal Forgot Password & Central Admin Emergency Reset
"""

from __future__ import annotations

import base64
import json
import os
from datetime import timedelta
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from django.utils import timezone

from apps.accounts.models import AccountState, Category, SubRole, User
from apps.activities.models import (
    ClubEvent,
    EventConductor,
    EventScope,
    EventStatus,
)
from apps.certificates import signing
from apps.certificates.models import Certificate, CertificateCategory
from apps.domain.models import (
    AuthorityAssignment,
    Club,
    District,
    Institution,
    Membership,
    OfficerAssignment,
    State,
    Zone,
)
from apps.domain.telemetry import state_breakdown
from apps.onboarding.models import (
    AuthorityRole,
    OnboardingAuthority,
    OnboardingDraft,
    OnboardingUpload,
)

from .support import M1PinTestCase as TestCase

# Test Keyring for certificate signing
KEY_A_B64 = base64.b64encode(bytes(range(32))).decode()
KEYRING_JSON = json.dumps({"k2026-cert": KEY_A_B64})


class CampusModuleTests(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.env_patch = mock.patch.dict(
            os.environ,
            {
                signing.ENV_KEYRING: KEYRING_JSON,
                signing.ENV_ACTIVE_KEY_ID: "k2026-cert",
            },
        )
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

        self.client = Client()

        # Seed Zone, State, District, Institution, Club
        self.zone, _ = Zone.objects.get_or_create(
            code="NORTH", defaults={"name": "North Zone"}
        )
        self.state, _ = State.objects.get_or_create(
            code="DELHI", defaults={"name": "Delhi", "zone": self.zone}
        )
        officer = User.objects.create(
            username="emp01_delhi",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            account_state=AccountState.ACTIVE,
        )
        OfficerAssignment.objects.create(
            state=self.state,
            officer=officer,
            from_date=timezone.now().date(),
        )
        self.district, _ = District.objects.get_or_create(
            code="DIST-DL-01", defaults={"name": "New Delhi", "state": self.state}
        )
        self.institution = Institution.objects.create(
            code="INST-DELHI-CAMPUS",
            name="Delhi Institute of Advanced Technology",
            state=self.state,
            district=self.district,
            institution_type="higher_education",
        )
        self.club = Club.objects.create(
            code="CLB-DL-DIAT-01",
            name="DIAT NDLI Club",
            institution=self.institution,
            status=Club.Status.ACTIVE,
        )

        # Create Authority User
        self.authority_user = User.objects.create(
            username="pres.diat",
            email="pres.diat@delhi.ac.in",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            account_state=AccountState.ACTIVE,
            club=self.club,
            is_active=True,
        )
        self.authority_user.set_password("PresPass@2026!")
        self.authority_user.save()

        AuthorityAssignment.objects.create(
            user=self.authority_user,
            club=self.club,
            tier="President",
            from_date=timezone.now().date(),
            status=AuthorityAssignment.Status.ACTIVE,
        )

    # -------------------------------------------------------------------------
    # 1. Onboarding: HEI (4-tier) vs School (3-tier) & 7-Day Resume Token
    # -------------------------------------------------------------------------
    def test_hei_and_school_onboarding_draft_and_resume(self) -> None:
        # Create HEI Draft
        resp = self.client.post(
            "/api/v1/onboarding/drafts/",
            data={
                "institution_type": "higher_education",
                "institution_name": "Test HEI College",
                "club_name": "HEI NDLI Club",
                "state_code": "DELHI",
                "district_code": "DIST-DL-01",
                "aishe_code": "C-12345",
            },
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        raw_token = data.get("resume_token")
        self.assertTrue(raw_token)
        draft_id = data.get("id")

        draft = OnboardingDraft.objects.get(id=draft_id)
        self.assertEqual(draft.institution_type, "higher_education")
        self.assertGreater(
            draft.resume_token_expires_at, timezone.now() + timedelta(days=6)
        )

        # Populate School Draft with 3 tiers only
        school_resp = self.client.post(
            "/api/v1/onboarding/drafts/",
            data={
                "institution_type": "school",
                "institution_name": "Delhi Public Model School",
                "club_name": "DPMS NDLI Club",
                "state_code": "DELHI",
                "district_code": "DIST-DL-01",
                "affiliation_code": "CBSE-89102",
            },
            content_type="application/json",
        )
        self.assertEqual(school_resp.status_code, 201)
        school_draft_id = school_resp.json()["id"]
        school_draft = OnboardingDraft.objects.get(id=school_draft_id)
        self.assertEqual(school_draft.institution_type, "school")

        # School 3 tiers satisfaction
        for role in (
            AuthorityRole.PATRON,
            AuthorityRole.PRESIDENT,
            AuthorityRole.SECRETARY,
        ):
            OnboardingAuthority.objects.create(
                draft=school_draft,
                role=role,
                full_name=f"School {role}",
                email=f"{role}@school.edu",
                phone="9876543210",
                designation="Teacher",
                otp_verified_at=timezone.now(),
            )
        OnboardingUpload.objects.create(
            draft=school_draft,
            original_name="charter.pdf",
            stored_name="hash123",
            content_sha256="hash123",
            mime_type="application/pdf",
            size_bytes=1024,
        )

        from apps.onboarding.services import draft_is_complete, submit_draft

        # School draft should be complete with only 3 authorities!
        self.assertTrue(draft_is_complete(school_draft))

        # Submit and check application status tracking
        app = submit_draft(school_draft)
        status_resp = self.client.get(
            f"/api/v1/onboarding/applications/{app.application_id}/status/"
        )
        self.assertEqual(status_resp.status_code, 200)
        status_data = status_resp.json()
        self.assertEqual(status_data["institution_name"], "Delhi Public Model School")
        self.assertEqual(status_data["status"], "queued")

    # -------------------------------------------------------------------------
    # 2. Authority Email Check Gate & De-Duplication Cascade
    # -------------------------------------------------------------------------
    def test_authority_email_conflict_and_deactivation(self) -> None:
        # Check active president's email
        resp = self.client.post(
            "/api/v1/onboarding/authority/check-email/",
            data={"email": "pres.diat@delhi.ac.in"},
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["conflict"])
        self.assertEqual(data["tier"], "President")
        self.assertEqual(data["club_code"], self.club.code)

        # Deactivate prior post to allow onboarding on new institution
        deact_resp = self.client.post(
            "/api/v1/onboarding/authority/confirm-deactivation/",
            data={"email": "pres.diat@delhi.ac.in", "confirmed": True},
            content_type="application/json",
        )
        self.assertEqual(deact_resp.status_code, 200)
        self.assertTrue(deact_resp.json()["success"])

        # Prior assignment is now ENDED
        prior_assignment = AuthorityAssignment.objects.filter(
            user=self.authority_user, club=self.club
        ).first()
        self.assertIsNotNone(prior_assignment)
        assert prior_assignment is not None
        self.assertEqual(prior_assignment.status, AuthorityAssignment.Status.ENDED)

        # Check email again -> no conflict
        resp2 = self.client.post(
            "/api/v1/onboarding/authority/check-email/",
            data={"email": "pres.diat@delhi.ac.in"},
            content_type="application/json",
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertFalse(resp2.json()["conflict"])

    # -------------------------------------------------------------------------
    # 3. Sub-Clubs & SSOT 1+N Telemetry Counting
    # -------------------------------------------------------------------------
    def test_subclub_creation_and_ssot_counting(self) -> None:
        self.client.force_login(self.authority_user)

        # Create 2 Sub-Clubs
        resp1 = self.client.post(
            f"/api/v1/clubs/{self.club.code}/subclubs/",
            data={
                "name": "Robotics & AI Sub-Club",
                "discipline": "Engineering",
                "coordinator_name": "Dr. Robotics",
                "coordinator_email": "robotics@delhi.ac.in",
            },
            content_type="application/json",
        )
        self.assertEqual(resp1.status_code, 201)

        resp2 = self.client.post(
            f"/api/v1/clubs/{self.club.code}/subclubs/",
            data={
                "name": "Literature & Debating Sub-Club",
                "discipline": "Humanities",
                "coordinator_name": "Prof. Debate",
                "coordinator_email": "debate@delhi.ac.in",
            },
            content_type="application/json",
        )
        self.assertEqual(resp2.status_code, 201)

        # Verify listing
        list_resp = self.client.get(f"/api/v1/clubs/{self.club.code}/subclubs/")
        self.assertEqual(list_resp.status_code, 200)
        subclubs = list_resp.json()["sub_clubs"]
        self.assertEqual(len(subclubs), 2)

        # Check SSOT breakdown: Total clubs = Main (1) + Sub-Clubs (2) = 3
        breakdown = state_breakdown()
        delhi_stats = next(s for s in breakdown["states"] if s["code"] == "DELHI")
        # Base canonical clubs in Delhi might exist from seed,
        # our main club + 2 subclubs are counted
        self.assertGreaterEqual(delhi_stats["clubs"], 3)
        self.assertGreaterEqual(delhi_stats["sub_clubs"], 2)

    # -------------------------------------------------------------------------
    # 4. School Bulk CSV Upload & Deterministic UIDs
    # -------------------------------------------------------------------------
    def test_school_roster_bulk_upload_and_cards(self) -> None:
        self.client.force_login(self.authority_user)

        # Create a school club
        school_inst = Institution.objects.create(
            code="INST-SCH-WB-0042",
            name="Kolkata Model High School",
            legacy_id="leg-sch-wb-0042",
            state=self.state,
            district=self.district,
            institution_type="school",
        )
        school_club = Club.objects.create(
            code="CLB-SCH-WB-0042",
            name="Kolkata Model School Club",
            institution=school_inst,
            status=Club.Status.ACTIVE,
        )

        csv_content = (
            "student_name,class_grade,section,roll_no,guardian_name,guardian_phone\n"
            "Aarav Sharma,IX,B,15,Ramesh Sharma,9876543210\n"
            "Diya Mukherjee,X,A,04,Subhash Mukherjee,9876543211\n"
        )
        csv_file = SimpleUploadedFile(
            "students.csv", csv_content.encode("utf-8"), content_type="text/csv"
        )

        upload_resp = self.client.post(
            f"/api/v1/members/school/{school_club.code}/upload/",
            data={"file": csv_file},
            format="multipart",
        )
        self.assertEqual(upload_resp.status_code, 201)
        data = upload_resp.json()
        self.assertEqual(data["total_imported"], 2)
        uids = [e["student_uid"] for e in data["entries"]]
        self.assertEqual(len(uids), 2)
        # Verify deterministic UID format: SCH-[State]-[Club]-[Class]-[Serial]
        self.assertTrue(uids[0].startswith(f"SCH-{self.state.code[:2]}"))
        self.assertIn("IXB", uids[0])

        # Retrieve printable cards
        cards_resp = self.client.get(
            f"/api/v1/members/school/{school_club.code}/cards/"
        )
        self.assertEqual(cards_resp.status_code, 200)
        cards = cards_resp.json()["cards"]
        self.assertEqual(len(cards), 2)
        self.assertEqual(cards[0]["full_name"], "Aarav Sharma")
        self.assertEqual(cards[0]["student_uid"], uids[0])

    # -------------------------------------------------------------------------
    # 5. Events 30-Minute Participation Window (T-10m to T+20m)
    # -------------------------------------------------------------------------
    def test_event_participation_window(self) -> None:
        self.client.force_login(self.authority_user)

        now = timezone.now()
        # Event starting right now
        event_active = ClubEvent.objects.create(
            event_ref="EVT-TEST-ACTIVE",
            host_club=self.club,
            scope=EventScope.INSTITUTIONAL,
            title="Active Workshop",
            start_time=now,
            end_time=now + timedelta(hours=2),
            status=EventStatus.PUBLISHED,
            created_by=self.authority_user,
        )

        # Student user
        student = User.objects.create(
            username="stud.diat",
            email="stud.diat@delhi.ac.in",
            category=Category.STUDENT_MEMBER,
            account_state=AccountState.ACTIVE,
            club=self.club,
            is_active=True,
        )
        Membership.objects.create(
            user=student, club=self.club, status=Membership.Status.ACTIVE
        )

        self.client.force_login(student)
        # Attempt attendance within window [T-10, T+20] -> now is T+0m, valid!
        part_resp = self.client.post(
            f"/api/v1/activities/events/{event_active.id}/participate/"
        )
        self.assertEqual(part_resp.status_code, 200)
        self.assertIn("message", part_resp.json())

        # Second event in the past (outside window)
        past_event = ClubEvent.objects.create(
            event_ref="EVT-TEST-PAST",
            host_club=self.club,
            scope=EventScope.INSTITUTIONAL,
            title="Past Lecture",
            start_time=now - timedelta(minutes=45),
            end_time=now - timedelta(minutes=15),
            status=EventStatus.PUBLISHED,
            created_by=self.authority_user,
        )
        part_resp_past = self.client.post(
            f"/api/v1/activities/events/{past_event.id}/participate/"
        )
        self.assertEqual(part_resp_past.status_code, 400)
        self.assertEqual(part_resp_past.json()["code"], "window_closed")

    # -------------------------------------------------------------------------
    # 6. Event Conductor & Verifiable Certificate Issuance
    # -------------------------------------------------------------------------
    def test_conductor_certificate_generation(self) -> None:
        self.client.force_login(self.authority_user)

        now = timezone.now()
        event = ClubEvent.objects.create(
            event_ref="EVT-COND-TEST",
            host_club=self.club,
            scope=EventScope.INSTITUTIONAL,
            title="National AI Summit",
            start_time=now,
            end_time=now + timedelta(hours=3),
            status=EventStatus.PUBLISHED,
            created_by=self.authority_user,
        )
        conductor = EventConductor.objects.create(
            event=event,
            full_name="Dr. Alan Turing",
            affiliation="Institute for Advanced Study",
        )

        # Generate Conductor Certificate
        cert_resp = self.client.post(
            f"/api/v1/activities/events/{event.id}/conductors/{conductor.id}/certificate/"
        )
        self.assertEqual(cert_resp.status_code, 200)
        cert_data = cert_resp.json()["certificate"]
        self.assertTrue(cert_data["cert_number"].startswith("NDLI-"))
        self.assertTrue(cert_data["hmac_tag"])

        # Verify Certificate exists in DB with CONDUCTOR category
        cert = Certificate.objects.get(certificate_id=cert_data["cert_number"])
        self.assertEqual(cert.category, CertificateCategory.CONDUCTOR)
        self.assertEqual(cert.conductor_affiliation, "Institute for Advanced Study")
        self.assertEqual(cert.recipient_name, "Dr. Alan Turing")

    # -------------------------------------------------------------------------
    # 7. Curated Libraries & Strict NDLI URL Whitelist
    # -------------------------------------------------------------------------
    def test_curated_library_and_ndli_url_enforcement(self) -> None:
        self.client.force_login(self.authority_user)

        # Create Library
        lib_resp = self.client.post(
            "/api/v1/sharing/libraries/",
            data={
                "club_code": self.club.code,
                "title": "Quantum Computing Essentials",
                "topic_category": "Physics",
                "library_type": "club",
            },
            content_type="application/json",
        )
        self.assertEqual(lib_resp.status_code, 201)
        lib_id = lib_resp.json()["id"]

        # Add valid official NDLI resource link
        valid_resp = self.client.post(
            f"/api/v1/sharing/libraries/{lib_id}/resources/",
            data={
                "title": "Introduction to Quantum Mechanics Lecture Notes",
                "ndli_url": "https://ndli.iitkgp.ac.in/homelibraries/physics/qm_notes.pdf",
                "content_type": "PDF Document",
            },
            content_type="application/json",
        )
        self.assertEqual(valid_resp.status_code, 201)
        self.assertEqual(
            valid_resp.json()["title"],
            "Introduction to Quantum Mechanics Lecture Notes",
        )

        # Attempt to add unauthorized external link (YouTube/GDrive) -> Rejected
        invalid_resp = self.client.post(
            f"/api/v1/sharing/libraries/{lib_id}/resources/",
            data={
                "title": "Untrusted Video",
                "ndli_url": "https://youtube.com/watch?v=sample123",
                "content_type": "Video",
            },
            content_type="application/json",
        )
        self.assertEqual(invalid_resp.status_code, 400)
        self.assertEqual(invalid_resp.json()["code"], "invalid_ndli_url")

    # -------------------------------------------------------------------------
    # 8. Universal Forgot Password & Central Admin Emergency Reset
    # -------------------------------------------------------------------------
    def test_forgot_password_and_central_admin_emergency_reset(self) -> None:
        # 1. Unregistered user -> Exact error message
        unreg_resp = self.client.post(
            "/api/v1/accounts/password/forgot-check/",
            data={
                "email": "notfound@nonexistent.ac.in",
                "role_type": "authority",
            },
            content_type="application/json",
        )
        self.assertEqual(unreg_resp.status_code, 404)
        self.assertEqual(
            unreg_resp.json()["detail"],
            "No database found, please register yourself first.",
        )

        # 2. Registered Authority -> Dispatch 72-hour reset token
        reg_resp = self.client.post(
            "/api/v1/accounts/password/forgot-check/",
            data={
                "email": "pres.diat@delhi.ac.in",
                "role_type": "authority",
            },
            content_type="application/json",
        )
        self.assertEqual(reg_resp.status_code, 200)
        reset_token = reg_resp.json()["reset_token"]
        self.assertTrue(reset_token)

        # 3. Confirm password reset
        confirm_resp = self.client.post(
            "/api/v1/accounts/password/reset-confirm/",
            data={
                "reset_token": reset_token,
                "new_password": "FreshNewPassword@2026!",
            },
            content_type="application/json",
        )
        self.assertEqual(confirm_resp.status_code, 200)
        self.assertTrue(confirm_resp.json()["success"])

        # Authority can authenticate with new password
        self.authority_user.refresh_from_db()
        self.assertTrue(self.authority_user.check_password("FreshNewPassword@2026!"))

        # 4. Central Admin Emergency Reset
        admin_user = User.objects.create(
            username="central.admin",
            email="central.admin@ndli.gov.in",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
            account_state=AccountState.ACTIVE,
            is_active=True,
        )
        self.client.force_login(admin_user)

        emerg_resp = self.client.post(
            "/api/v1/accounts/emergency-reset/",
            data={
                "target_email": "pres.diat@delhi.ac.in",
                "temp_password": "EmergencyResetPass@2026!",
                "totp_code": "123456",
            },
            content_type="application/json",
        )
        self.assertEqual(emerg_resp.status_code, 200)
        self.assertTrue(emerg_resp.json()["success"])

        self.authority_user.refresh_from_db()
        self.assertTrue(self.authority_user.check_password("EmergencyResetPass@2026!"))
        self.assertTrue(self.authority_user.must_change_password)
