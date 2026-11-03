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
import io
import json
import os
import zipfile
from datetime import timedelta
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from django.utils import timezone

from apps.accounts.models import AccountState, Category, SubRole, User
from apps.activities.models import (
    ClubEvent,
    EventAttendance,
    EventCollaboration,
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

        # Entries are staged PENDING — no active cards until approved
        cards_before = self.client.get(
            f"/api/v1/members/school/{school_club.code}/cards/"
        )
        self.assertEqual(cards_before.json()["total"], 0)

        # Approve both pending entries via authority endpoint
        pending_resp = self.client.get(
            f"/api/v1/members/school/{school_club.code}/pending/"
        )
        self.assertEqual(pending_resp.status_code, 200)
        pending = pending_resp.json()
        self.assertEqual(pending["pending_count"], 2)
        entry_ids = [e["id"] for e in pending["entries"]]

        approve_resp = self.client.post(
            f"/api/v1/members/school/{school_club.code}/approve/",
            data=json.dumps({"entry_ids": entry_ids}),
            content_type="application/json",
        )
        self.assertEqual(approve_resp.status_code, 200)
        self.assertEqual(approve_resp.json()["updated"], 2)

        # Retrieve printable cards — now both approved entries are active
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

    # -------------------------------------------------------------------------
    # 9. HEI Student Joining, Authority Workflow & Member Module
    # -------------------------------------------------------------------------
    def test_hei_student_lifecycle_and_member_module(self) -> None:
        from apps.clubs.services import issue_passkey
        from apps.members.models import JoinRequest, StudentMemberProfile

        # Mint active passkey for the club
        passkey = issue_passkey(club=self.club, issued_by=self.authority_user)

        # 1. Student Passkey Registration (Public / Self-Join)
        reg_resp = self.client.post(
            "/api/v1/members/students/register/",
            data={
                "passkey": passkey,
                "full_name": "Rohan Gupta",
                "gender": "male",
                "email": "rohan.gupta@student.delhi.ac.in",
                "password": "SecureStudentPass@2026!",
                "department": "Computer Science & Engineering",
                "roll_number": "2024CSB1042",
            },
            content_type="application/json",
        )
        self.assertEqual(reg_resp.status_code, 201)
        reg_data = reg_resp.json()
        self.assertTrue(reg_data["success"])
        self.assertEqual(reg_data["roll_number"], "2024CSB1042")

        # Verify JoinRequest and Profile created
        join_req = JoinRequest.objects.filter(
            club=self.club, user__email="rohan.gupta@student.delhi.ac.in"
        ).first()
        self.assertIsNotNone(join_req)
        assert join_req is not None
        self.assertEqual(join_req.status, JoinRequest.Status.PENDING)

        student_user = join_req.user
        self.assertEqual(student_user.category, Category.STUDENT_MEMBER)

        # 2. Club Authority reviews Pending Joins & Batch Approves
        self.client.force_login(self.authority_user)
        batch_resp = self.client.post(
            "/api/v1/members/joins/batch-confirm/",
            data={
                "club_code": self.club.code,
                "approve_all": True,
            },
            content_type="application/json",
        )
        self.assertEqual(batch_resp.status_code, 200)
        self.assertEqual(batch_resp.json()["count"], 1)

        join_req.refresh_from_db()
        self.assertEqual(join_req.status, JoinRequest.Status.APPROVED)

        # 2b. Verify student can log in via club_login (account_state is ACTIVE)
        from apps.accounts.services import PermissionDenied, club_login

        login_res = club_login(
            username=student_user.username,
            password="SecureStudentPass@2026!",
            request=None,
        )
        self.assertEqual(login_res.id, student_user.id)

        # 3. Club Authority views Existing Members list with filters
        list_resp = self.client.get(
            f"/api/v1/members/students/?club_code={self.club.code}&department=Computer"
        )
        self.assertEqual(list_resp.status_code, 200)
        members_data = list_resp.json()
        self.assertGreaterEqual(members_data["total"], 1)
        first_member = members_data["results"][0]
        self.assertEqual(first_member["roll_number"], "2024CSB1042")
        self.assertEqual(first_member["status"], "active")

        # 4. Club Authority updates validity to 3 years and tests suspension
        profile_id = first_member["id"]
        patch_resp = self.client.patch(
            f"/api/v1/members/students/{profile_id}/",
            data={
                "validity_years": 3,
                "is_suspended": True,
            },
            content_type="application/json",
        )
        self.assertEqual(patch_resp.status_code, 200)

        prof = StudentMemberProfile.objects.get(id=profile_id)
        self.assertEqual(prof.validity_years, 3)
        self.assertTrue(prof.is_suspended_by_coordinator)

        # Verify suspended student cannot log in via club_login
        with self.assertRaises(PermissionDenied) as ctx:
            club_login(
                username=student_user.username,
                password="SecureStudentPass@2026!",
                request=None,
            )
        self.assertEqual(ctx.exception.detail.code, "account_suspended")

        # Verify suspended student cannot patch profile or subclubs
        self.client.force_login(student_user)
        self.assertEqual(
            self.client.patch(
                "/api/v1/members/me/",
                data={"hobbies": "Gaming"},
                content_type="application/json",
            ).status_code,
            403,
        )

        # Re-activate student
        self.client.force_login(self.authority_user)
        self.client.patch(
            f"/api/v1/members/students/{profile_id}/",
            data={"is_suspended": False},
            content_type="application/json",
        )

        # Verify validity expiration rejection
        from datetime import timedelta

        prof.valid_until = timezone.localdate() - timedelta(days=1)
        prof.save(update_fields=["valid_until"])

        with self.assertRaises(PermissionDenied) as ctx:
            club_login(
                username=student_user.username,
                password="SecureStudentPass@2026!",
                request=None,
            )
        self.assertEqual(ctx.exception.detail.code, "membership_expired")

        # Restore validity
        prof.valid_until = timezone.localdate() + timedelta(days=365)
        prof.save(update_fields=["valid_until"])

        # 5. Student logs in and accesses /api/v1/members/me/
        self.client.force_login(student_user)
        me_resp = self.client.get("/api/v1/members/me/")
        self.assertEqual(me_resp.status_code, 200)
        me_data = me_resp.json()
        self.assertEqual(me_data["profile"]["roll_number"], "2024CSB1042")
        self.assertEqual(me_data["stats"]["points"], 0)
        self.assertEqual(me_data["stats"]["badge"], "copper")

        # 6. Sub-Clubs & Coordinator Permission Testing
        from apps.domain.models import SubClub

        sub_club = SubClub.objects.create(
            club=self.club,
            name="Robotics Society",
            code=f"ROBO-{self.club.code[:4]}",
            discipline="Technology",
            coordinator_name="Dr. Rao",
            coordinator_email="rao@delhi.ac.in",
            created_by=self.authority_user,
            is_active=True,
        )

        coord_user = User.objects.create(
            username="coord.rao",
            email="rao@delhi.ac.in",
            club=self.club,
            institution=self.club.institution,
            category=Category.CLUB_ADMIN,
            account_state=AccountState.ACTIVE,
            is_active=True,
        )

        # Student selects preferred sub-club
        self.client.force_login(student_user)
        subclub_resp = self.client.post(
            "/api/v1/members/me/subclubs/",
            data={"subclub_ids": [sub_club.id]},
            content_type="application/json",
        )
        self.assertEqual(subclub_resp.status_code, 200)
        self.assertEqual(len(subclub_resp.json()["sub_clubs"]), 1)

        # Coordinator can toggle suspension for member of their sub-club
        self.client.force_login(coord_user)
        coord_patch = self.client.patch(
            f"/api/v1/members/students/{profile_id}/",
            data={"is_suspended": True},
            content_type="application/json",
        )
        self.assertEqual(coord_patch.status_code, 200)
        prof.refresh_from_db()
        self.assertTrue(prof.is_suspended_by_coordinator)

        # But coordinator CANNOT modify validity_years (HTTP 403)
        coord_bad_patch = self.client.patch(
            f"/api/v1/members/students/{profile_id}/",
            data={"validity_years": 5},
            content_type="application/json",
        )
        self.assertEqual(coord_bad_patch.status_code, 403)

        # And coordinator CANNOT delete student profile (HTTP 403)
        coord_del = self.client.delete(f"/api/v1/members/students/{profile_id}/")
        self.assertEqual(coord_del.status_code, 403)

        # Coordinator unsuspends
        self.client.patch(
            f"/api/v1/members/students/{profile_id}/",
            data={"is_suspended": False},
            content_type="application/json",
        )

        # 7. Student changes password in-app
        self.client.force_login(student_user)
        pw_resp = self.client.post(
            "/api/v1/members/me/change-password/",
            data={
                "current_password": "SecureStudentPass@2026!",
                "new_password": "UpdatedStudentPass@2026!",
            },
            content_type="application/json",
        )
        self.assertEqual(pw_resp.status_code, 200)
        student_user.refresh_from_db()
        self.assertTrue(student_user.check_password("UpdatedStudentPass@2026!"))

        # 8. Authority permanently removes member
        self.client.force_login(self.authority_user)
        del_resp = self.client.delete(f"/api/v1/members/students/{profile_id}/")
        self.assertEqual(del_resp.status_code, 200)
        self.assertFalse(StudentMemberProfile.objects.filter(id=profile_id).exists())

        student_user.refresh_from_db()
        self.assertEqual(student_user.club_id, "")
        self.assertEqual(student_user.institution_id, "")
        self.assertEqual(student_user.account_state, AccountState.DORMANT)

        # 9. Verify re-registration with same email at another club
        from apps.domain.models import Club, Institution

        other_inst = Institution.objects.create(
            code="INST-MUMBAI-TECH",
            legacy_id="LEG-MUMBAI-01",
            name="Mumbai University",
            state=self.club.institution.state,
            district=self.district,
            institution_type="higher_education",
        )
        other_club = Club.objects.create(
            name="Mumbai Tech Club",
            code="MUMBAI-TECH-01",
            institution=other_inst,
            status=Club.Status.ACTIVE,
        )
        other_passkey = issue_passkey(club=other_club, issued_by=self.authority_user)

        re_reg = self.client.post(
            "/api/v1/members/students/register/",
            data={
                "passkey": other_passkey,
                "full_name": "Rohan Gupta",
                "gender": "male",
                "email": "rohan.gupta@student.delhi.ac.in",
                "password": "NewStudentPass@2026!",
                "department": "Information Technology",
                "roll_number": "2024ITB2001",
            },
            content_type="application/json",
        )
        self.assertEqual(re_reg.status_code, 201)
        self.assertTrue(re_reg.json()["success"])

    # -------------------------------------------------------------------------
    # 10. Multi-Club Collaboration Retry Limit (Max 1 Retry)
    # -------------------------------------------------------------------------
    def test_event_collaboration_retry_limit(self) -> None:
        partner_inst = Institution.objects.create(
            code="INST-IIT-DELHI",
            legacy_id="LEG-IITD-01",
            name="IIT Delhi",
            state=self.state,
            district=self.district,
            institution_type="higher_education",
        )
        partner_club = Club.objects.create(
            code="CLB-DL-IITD-01",
            name="IIT Delhi NDLI Club",
            institution=partner_inst,
            status=Club.Status.ACTIVE,
        )

        now = timezone.now()
        event = ClubEvent.objects.create(
            event_ref="EVT-COLLAB-01",
            host_club=self.club,
            scope=EventScope.MULTI_CLUB,
            title="Joint Tech Symposium",
            start_time=now + timedelta(days=2),
            end_time=now + timedelta(days=2, hours=3),
            status=EventStatus.DRAFT,
            created_by=self.authority_user,
        )
        collab = EventCollaboration.objects.create(
            event=event,
            partner_club=partner_club,
            status=EventCollaboration.Status.REJECTED,
            retry_count=0,
        )

        self.client.force_login(self.authority_user)

        # 1. First retry succeeds
        resp = self.client.post(
            f"/api/v1/activities/events/collaborations/{collab.id}/retry/"
        )
        self.assertEqual(resp.status_code, 200)
        collab.refresh_from_db()
        self.assertEqual(collab.status, EventCollaboration.Status.INVITED)
        self.assertEqual(collab.retry_count, 1)

        # 2. Cannot retry while in INVITED state
        resp_invalid = self.client.post(
            f"/api/v1/activities/events/collaborations/{collab.id}/retry/"
        )
        self.assertEqual(resp_invalid.status_code, 400)
        self.assertEqual(resp_invalid.json()["code"], "invalid_state")

        # 3. Second retry fails with retry_limit_reached
        collab.status = EventCollaboration.Status.REJECTED
        collab.save(update_fields=["status"])

        resp_limit = self.client.post(
            f"/api/v1/activities/events/collaborations/{collab.id}/retry/"
        )
        self.assertEqual(resp_limit.status_code, 400)
        self.assertEqual(resp_limit.json()["code"], "retry_limit_reached")

    # -------------------------------------------------------------------------
    # 11. School Participant Upload & Deterministic Student UIDs
    # -------------------------------------------------------------------------
    def test_school_participant_upload_and_deterministic_uids(self) -> None:
        from apps.members.models import SchoolStudentRoster

        now = timezone.now()
        event = ClubEvent.objects.create(
            event_ref="EVT-SCH-UPLOAD",
            host_club=self.club,
            scope=EventScope.INSTITUTIONAL,
            title="School Science Quiz",
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
            status=EventStatus.PUBLISHED,
            created_by=self.authority_user,
        )

        csv_content = (
            "Full Name,Gender,Class,Section,Guardian Phone\n"
            "Aarav Sharma,male,X,A,9876543210\n"
            "Priya Singh,female,X,B,9876543211\n"
            "Rohan Das,male,IX,A,9876543212\n"
        )
        csv_file = SimpleUploadedFile(
            "participants.csv",
            csv_content.encode("utf-8"),
            content_type="text/csv",
        )

        self.client.force_login(self.authority_user)
        resp = self.client.post(
            f"/api/v1/activities/events/{event.id}/upload-participants/",
            data={"file": csv_file},
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["enrolled_count"], 3)
        self.assertEqual(len(data["participants"]), 3)

        # Verify attendances created
        self.assertEqual(EventAttendance.objects.filter(event=event).count(), 3)

        # Verify deterministic UID format: SCH-[State]-[Club]-[Class]-[Serial]
        for p in data["participants"]:
            self.assertTrue(p["student_uid"].startswith("SCH-DE-CLBD"))

        roster_count = SchoolStudentRoster.objects.filter(club=self.club).count()
        self.assertGreaterEqual(roster_count, 3)

    # -------------------------------------------------------------------------
    # 12. Bulk Event Certificates ZIP Download with Embedded UIDs
    # -------------------------------------------------------------------------
    def test_event_certificates_zip_download(self) -> None:
        now = timezone.now()
        event = ClubEvent.objects.create(
            event_ref="EVT-SCH-CERT",
            host_club=self.club,
            scope=EventScope.INSTITUTIONAL,
            title="School Annual Essay Contest",
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            status=EventStatus.PUBLISHED,
            created_by=self.authority_user,
        )

        csv_content = (
            "Full Name,Gender,Class,Section,Guardian Phone\n"
            "Ananya Sen,female,VIII,A,9876543215\n"
            "Kabir Verma,male,VIII,B,9876543216\n"
        )
        csv_file = SimpleUploadedFile(
            "participants.csv",
            csv_content.encode("utf-8"),
            content_type="text/csv",
        )

        self.client.force_login(self.authority_user)
        self.client.post(
            f"/api/v1/activities/events/{event.id}/upload-participants/",
            data={"file": csv_file},
        )

        # Download ZIP
        zip_resp = self.client.get(
            f"/api/v1/activities/events/{event.id}/download-certificates-zip/"
        )
        self.assertEqual(zip_resp.status_code, 200)
        self.assertIn("application/zip", zip_resp["Content-Type"])

        # Inspect ZIP contents
        with zipfile.ZipFile(io.BytesIO(zip_resp.content)) as zf:
            namelist = zf.namelist()
            self.assertIn("manifest.csv", namelist)
            cert_files = [f for f in namelist if f.startswith("certificates/")]
            self.assertEqual(len(cert_files), 2)

            manifest_text = zf.read("manifest.csv").decode("utf-8")
            self.assertIn("Ananya Sen", manifest_text)
            self.assertIn("Kabir Verma", manifest_text)
            self.assertIn("SCH-DE-CLBD", manifest_text)

            sample_cert = zf.read(cert_files[0]).decode("utf-8")
            self.assertIn("HMAC Tag (V2)", sample_cert)
            self.assertIn("Student UID", sample_cert)

    def test_event_certificate_approval_saves_and_signs_certificates(self) -> None:
        """Verify EventCertificateApprovalView creates signed, persisted
        Certificate records.
        """
        from apps.certificates import services
        from apps.members.models import SchoolStudentRoster

        now = timezone.now()
        event = ClubEvent.objects.create(
            event_ref="EVT-APPROVE-TEST",
            host_club=self.club,
            scope=EventScope.INSTITUTIONAL,
            title="Interactive Workshop",
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            status=EventStatus.PUBLISHED,
            created_by=self.authority_user,
        )

        roster_entry = SchoolStudentRoster.objects.create(
            club=self.club,
            student_uid="SCH-TEST-UID-001",
            full_name="Pooja Sen",
            student_class="X",
            section="A",
            batch_year=now.year,
            is_active=True,
        )
        att = EventAttendance.objects.create(
            event=event,
            school_student=roster_entry,
            is_approved=False,
        )

        # 1. Unauthenticated request should fail (401)
        self.client.logout()
        unauth_resp = self.client.post(
            f"/api/v1/activities/events/{event.id}/approve-certificates/",
            data={"password": "any", "approve_all": True},
            content_type="application/json",
        )
        self.assertIn(unauth_resp.status_code, (401, 403))

        # 2. Authenticated request with password challenge
        self.client.force_login(self.authority_user)
        resp = self.client.post(
            f"/api/v1/activities/events/{event.id}/approve-certificates/",
            data={"password": "Club@123", "approve_all": True},
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["issued_count"], 1)

        # 3. Verify Certificate record was saved to DB and signed
        cert = Certificate.objects.filter(
            club=self.club, event_ref=event.event_ref
        ).first()
        self.assertIsNotNone(cert)
        assert cert is not None
        self.assertEqual(cert.recipient_name, "Pooja Sen")
        self.assertEqual(cert.student_uid, "SCH-TEST-UID-001")
        self.assertTrue(cert.hmac_tag)

        # 4. Verify certificate validates under HMAC signing service
        verify_result = services.verify_certificate(cert.certificate_id)
        self.assertEqual(verify_result.status, services.STATUS_VALID)

        # 5. Verify attendance was updated to approved
        att.refresh_from_db()
        self.assertTrue(att.is_approved)
        self.assertIsNotNone(att.approved_at)

    def test_event_certificates_zip_download_zero_attendees(self) -> None:
        """Verify downloading certificate zip for event with 0 attendees
        returns valid zip with manifest.
        """
        now = timezone.now()
        event = ClubEvent.objects.create(
            event_ref="EVT-EMPTY-ZIP",
            host_club=self.club,
            scope=EventScope.INSTITUTIONAL,
            title="Empty Attendee Event",
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            status=EventStatus.PUBLISHED,
            created_by=self.authority_user,
        )

        self.client.force_login(self.authority_user)
        zip_resp = self.client.get(
            f"/api/v1/activities/events/{event.id}/download-certificates-zip/"
        )
        self.assertEqual(zip_resp.status_code, 200)
        self.assertIn("application/zip", zip_resp["Content-Type"])

        with zipfile.ZipFile(io.BytesIO(zip_resp.content)) as zf:
            namelist = zf.namelist()
            self.assertIn("manifest.csv", namelist)
            manifest_text = zf.read("manifest.csv").decode("utf-8")
            self.assertIn("certificate_id,student_uid,recipient_name", manifest_text)

    def test_event_participant_upload_ragged_csv(self) -> None:
        """Verify CSV with ragged columns (missing fields / None values) and
        non-ASCII chars is parsed safely.
        """
        from apps.members.models import SchoolStudentRoster

        now = timezone.now()
        event = ClubEvent.objects.create(
            event_ref="EVT-RAGGED-CSV",
            host_club=self.club,
            scope=EventScope.INSTITUTIONAL,
            title="School Folk Dance",
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            status=EventStatus.PUBLISHED,
            created_by=self.authority_user,
        )

        # Row 2 is ragged: only has one field (name), header has 5 fields
        csv_content = (
            "Full Name,Gender,Class,Section,Guardian Phone\n"
            "Maitreyi Deb,female,IX,B,9876543210\n"
            "Rohan Mukherjee\n"
        )
        csv_file = SimpleUploadedFile(
            "ragged.csv",
            csv_content.encode("utf-8"),
            content_type="text/csv",
        )

        self.client.force_login(self.authority_user)
        resp = self.client.post(
            f"/api/v1/activities/events/{event.id}/upload-participants/",
            data={"file": csv_file},
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["enrolled_count"], 2)
        roster = SchoolStudentRoster.objects.filter(
            club=self.club, full_name="Rohan Mukherjee"
        ).first()
        self.assertIsNotNone(roster)
        assert roster is not None

    def test_event_participant_upload_non_utf8_fallback(self) -> None:
        """Verify EventParticipantUploadView decodes non-UTF8 (latin-1) CSV
        without stream exhaustion.
        """
        now = timezone.now()
        event = ClubEvent.objects.create(
            event_ref="EVT-LATIN1-TEST",
            host_club=self.club,
            scope=EventScope.INSTITUTIONAL,
            title="French Cultural Exchange",
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            status=EventStatus.PUBLISHED,
            created_by=self.authority_user,
        )

        csv_text = (
            "Full Name,Gender,Class,Section\n"
            "Maitreyi Deb,female,IX,B\n"
            "Renée Dupont,female,X,A\n"
        )
        csv_bytes = csv_text.encode("latin-1")
        csv_file = SimpleUploadedFile(
            "latin1.csv",
            csv_bytes,
            content_type="text/csv",
        )

        self.client.force_login(self.authority_user)
        resp = self.client.post(
            f"/api/v1/activities/events/{event.id}/upload-participants/",
            data={"file": csv_file},
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["enrolled_count"], 2)

    def test_school_roster_upload_non_utf8_fallback(self) -> None:
        """Verify SchoolRosterUploadView decodes non-UTF8 (latin-1) CSV without
        raising UnicodeDecodeError.
        """
        csv_text = (
            "Full Name,Gender,Class,Section,Guardian Phone\n"
            "Ananya Sen,female,VIII,A,9876543210\n"
            "François Dubois,male,IX,C,9876543211\n"
        )
        csv_bytes = csv_text.encode("latin-1")
        csv_file = SimpleUploadedFile(
            "school_latin1.csv",
            csv_bytes,
            content_type="text/csv",
        )

        self.client.force_login(self.authority_user)
        resp = self.client.post(
            f"/api/v1/members/school/{self.club.code}/upload/",
            data={"file": csv_file},
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["total_imported"], 2)

    def test_student_profile_list_excludes_pending_applicants(self) -> None:
        """Verify StudentProfileListView excludes unapproved pending applicants
        and includes active members.
        """
        from apps.accounts.models import AccountState, Category, User
        from apps.members.models import StudentMemberProfile

        # 1. Create a pending student applicant
        pending_user = User.objects.create(
            username="pending_applicant_test",
            email="pending.app@test.edu",
            account_state=AccountState.PENDING_APPROVAL,
            category=Category.STUDENT_MEMBER,
        )
        pending_prof = StudentMemberProfile.objects.create(
            user=pending_user,
            club=self.club,
            gender="male",
            department="CSE",
            roll_number="PEND-001",
        )

        # 2. Query roster as authority
        self.client.force_login(self.authority_user)
        resp = self.client.get(f"/api/v1/members/students/?club_code={self.club.code}")
        self.assertEqual(resp.status_code, 200)
        emails = [r["email"] for r in resp.json().get("results", [])]
        self.assertNotIn("pending.app@test.edu", emails)

        # 3. Transition to active approved member
        pending_user.account_state = AccountState.ACTIVE
        pending_user.save(update_fields=["account_state"])

        resp2 = self.client.get(f"/api/v1/members/students/?club_code={self.club.code}")
        self.assertEqual(resp2.status_code, 200)
        emails2 = [r["email"] for r in resp2.json().get("results", [])]
        self.assertIn("pending.app@test.edu", emails2)

        # Cleanup
        pending_prof.delete()
        pending_user.delete()

    def test_admin_club_list_view_canonical_member_count(self) -> None:
        """Verify AdminClubListView returns canonical calculated member count
        and handles admin user without reverse club attribute.
        """
        from apps.accounts.models import AccountState, Category, SubRole, User

        admin_user, _ = User.objects.get_or_create(
            username="central_admin_test",
            defaults={
                "email": "central.adm@ndli.gov.in",
                "category": Category.IIT_KGP_ADMIN,
                "sub_role": SubRole.CENTRAL_ADMIN,
                "account_state": AccountState.ACTIVE,
                "must_change_password": False,
                "is_active": True,
            },
        )
        if admin_user.account_state != AccountState.ACTIVE:
            admin_user.account_state = AccountState.ACTIVE
            admin_user.must_change_password = False
            admin_user.save()

        self.client.force_login(admin_user)
        session = self.client.session
        session["mfa_verified"] = True
        session.save()
        resp = self.client.get("/admin/api/v1/employees/clubs/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("clubs", data)
        for club_dict in data["clubs"]:
            self.assertIsInstance(club_dict["member_count"], int)
            self.assertGreaterEqual(club_dict["member_count"], 0)

    def test_canonical_clubs_activity_counts_ssot_zero_without_events(self) -> None:
        """Verify get_all_canonical_clubs enforces SSOT: all activity counts
        (eventsConducted, soloSessions, jointSessions) are 0 when no real events
        or non-approval activity logs exist. Approval logs (e.g. 'Club Approval')
        are strictly excluded from activity counts.
        """
        from apps.activities.models import (
            APPROVAL_LOG_TYPES,
            ActivityLog,
            SupportType,
        )
        from apps.domain.clubs import get_all_canonical_clubs

        # Ensure an approval log exists for self.club
        ActivityLog.objects.create(
            employee=self.authority_user,
            club_code=self.club.code,
            support_type=SupportType.CLUB_APPROVAL,
            notes="Club Approval Auto-Heal",
        )
        self.assertIn(SupportType.CLUB_APPROVAL, APPROVAL_LOG_TYPES)

        clubs = get_all_canonical_clubs()
        self.assertGreaterEqual(len(clubs), 1)
        self_club_entry = next((c for c in clubs if c["code"] == self.club.code), None)
        self.assertIsNotNone(self_club_entry)
        assert self_club_entry is not None

        # Approval log must not be counted!
        self.assertEqual(self_club_entry["eventsConducted"], 0)
        self.assertEqual(self_club_entry["events_conducted"], 0)
        self.assertEqual(self_club_entry["soloSessions"], 0)
        self.assertEqual(self_club_entry["jointSessions"], 0)
        self.assertEqual(self_club_entry["solo_activities"], 0)
        self.assertEqual(self_club_entry["joint_activities"], 0)

        # Now create a real event and verify counts reflect it
        event = ClubEvent.objects.create(
            event_ref="EVT-TEST-SSOT-01",
            host_club=self.club,
            scope=EventScope.INSTITUTIONAL,
            title="Real Event",
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(hours=1),
            status=EventStatus.COMPLETED,
            created_by=self.authority_user,
        )

        clubs_after = get_all_canonical_clubs()
        self_club_after = next(
            (c for c in clubs_after if c["code"] == self.club.code), None
        )
        assert self_club_after is not None
        self.assertEqual(self_club_after["eventsConducted"], 1)
        self.assertEqual(self_club_after["events_conducted"], 1)
        self.assertEqual(self_club_after["soloSessions"], 1)
        self.assertEqual(self_club_after["jointSessions"], 0)
        self.assertEqual(self_club_after["solo_activities"], 1)
        self.assertEqual(self_club_after["joint_activities"], 0)

        # Clean up event
        event.delete()

    def test_sub_club_list_view_resolution_and_allow_any(self) -> None:
        """Verify SubClubListView returns 200 without authentication and resolves
        clubs by club code, slug (e.g. bhu-main), or ID.
        """
        bhu_inst, _ = Institution.objects.get_or_create(
            code="INST-BHU-TEST-008",
            defaults={
                "legacy_id": "LEGACY-BHU-TEST-008",
                "name": "Banaras Hindu University",
                "state": self.state,
                "district": self.district,
                "institution_type": Institution.Type.HIGHER_EDUCATION,
            },
        )
        bhu_club, _ = Club.objects.get_or_create(
            code="CLUB-BHU-008",
            defaults={
                "name": "Banaras Hindu University",
                "institution": bhu_inst,
                "status": Club.Status.ACTIVE,
            },
        )
        from apps.domain.models import SubClub

        if not SubClub.objects.filter(club=bhu_club).exists():
            SubClub.objects.create(
                club=bhu_club,
                code="CLUB-BHU-008-SUB-TEST",
                name="BHU Test Sub-Club",
                discipline="Computer Science",
                created_by=self.authority_user,
            )

        # Unauthenticated client request by code
        anon_client = Client()
        resp_code = anon_client.get(
            f"/api/v1/clubs/{bhu_club.code}/subclubs/", HTTP_HOST="localhost"
        )
        self.assertEqual(resp_code.status_code, 200)
        data_code = resp_code.json()
        self.assertIn("sub_clubs", data_code)
        self.assertGreaterEqual(len(data_code["sub_clubs"]), 1)
        sub_item = data_code["sub_clubs"][0]
        self.assertIn("is_active", sub_item)
        self.assertTrue(sub_item["is_active"])
        self.assertEqual(sub_item["club_id"], bhu_club.code)
        self.assertIn("member_count", sub_item)

        # Unauthenticated client request by slug
        resp_slug = anon_client.get(
            "/api/v1/clubs/bhu-main/subclubs/", HTTP_HOST="localhost"
        )
        self.assertEqual(resp_slug.status_code, 200)
        data_slug = resp_slug.json()
        self.assertIn("sub_clubs", data_slug)
        self.assertGreaterEqual(len(data_slug["sub_clubs"]), 1)

        # Unauthenticated client request by PK
        resp_pk = anon_client.get(
            f"/api/v1/clubs/{bhu_club.id}/subclubs/", HTTP_HOST="localhost"
        )
        self.assertEqual(resp_pk.status_code, 200)
        data_pk = resp_pk.json()
        self.assertIn("sub_clubs", data_pk)
        self.assertGreaterEqual(len(data_pk["sub_clubs"]), 1)

        # PATCH subclub using slug resolution
        subclub_obj = SubClub.objects.filter(club=bhu_club).first()
        self.assertIsNotNone(subclub_obj)
        assert subclub_obj is not None
        patch_resp = anon_client.patch(
            f"/api/v1/clubs/bhu-main/subclubs/{subclub_obj.id}/",
            data={"coordinator_phone": "+91 9876543210"},
            content_type="application/json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(patch_resp.status_code, 200)
        self.assertEqual(patch_resp.json().get("coordinator_phone"), "+91 9876543210")

    def test_student_test_accounts_login_and_state(self) -> None:
        """Verify seeded test student accounts and bhu.president exist from migrations
        with active state and can authenticate with DEV_TEST captcha bypass using
        username and email.
        """
        from apps.accounts.models import AccountState, User

        test_accounts = [
            ("student.bhu", "student.bhu@bhu.ac.in"),
            ("student.iitkgp", "student.iitkgp@iitkgp.ac.in"),
            ("student.du", "student.du@du.ac.in"),
            ("bhu.president", "pres.bhu@bhu.ac.in"),
        ]

        for username, email in test_accounts:
            user = User.objects.filter(username=username).first()
            self.assertIsNotNone(
                user, f"Test account {username} must exist from migration."
            )
            assert user is not None
            self.assertTrue(user.is_active)
            self.assertEqual(user.account_state, AccountState.ACTIVE)
            self.assertFalse(user.must_change_password)

            # Test login via username
            anon_client = Client()
            resp_user = anon_client.post(
                "/api/v1/accounts/login/",
                data={
                    "username": username,
                    "password": "Password@123",
                    "captcha": "DEV_TEST",
                },
                content_type="application/json",
                HTTP_HOST="localhost",
            )
            self.assertEqual(
                resp_user.status_code,
                200,
                f"Login failed for {username}: {resp_user.content.decode()}",
            )

            # Test login via email
            resp_email = anon_client.post(
                "/api/v1/accounts/login/",
                data={
                    "username": email,
                    "password": "Password@123",
                    "captcha": "DEV_TEST",
                },
                content_type="application/json",
                HTTP_HOST="localhost",
            )
            self.assertEqual(
                resp_email.status_code,
                200,
                f"Login failed for {email}: {resp_email.content.decode()}",
            )
