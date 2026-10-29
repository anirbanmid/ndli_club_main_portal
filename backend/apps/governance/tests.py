"""Governance tests — charter sanction gate (D2a) + club materialisation (D2b).

Covered: happy-path materialisation, signature verification via the ONE
signer, idempotency, account provisioning/reuse, tier mapping, holder rule,
state-machine flow, reject path, audit trail (P0), and the fail-fast aborts.
"""

from __future__ import annotations

import base64
import json
import os
from datetime import timedelta
from typing import Any, cast

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from apps.accounts.models import AccountState, Category, SubRole
from apps.audit.models import AuditLog
from apps.certificates import signing
from apps.certificates.ids import (
    is_valid_certificate_id,
)
from apps.certificates.models import Certificate, CertificateCategory
from apps.domain.models import (
    AuthorityAssignment,
    Club,
    District,
    Institution,
    State,
    Zone,
)
from apps.governance.materialisation import materialise_charter
from apps.governance.models import CharterMaterialisation
from apps.governance.services import GovernanceError, review_charter
from apps.onboarding.models import (
    AuthorityRole,
    CharterApplication,
    OnboardingAuthority,
    OnboardingDraft,
    OnboardingUpload,
)


class CharterMaterialisationTests(TestCase):
    """D2b: sanction -> Institution + Club + AuthorityAssignment + certificate."""

    # Fixture attributes created in setUpTestData/setUp (declared for mypy).
    application: CharterApplication
    district: District
    draft: OnboardingDraft
    officer: Any
    state: State
    zone: Zone

    @classmethod
    def setUpTestData(cls) -> None:
        cls.zone = Zone.objects.create(code="N1", name="North 1")
        cls.state = State.objects.create(code="UP", name="Uttar Pradesh", zone=cls.zone)
        cls.district = District.objects.create(
            state=cls.state, code="LDN", name="Lucknow"
        )
        cls.officer = get_user_model().objects.create_user(
            username="emp03",
            email="emp03@example.test",
            password="Str0ng-Passw0rd!",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code=cls.zone.code,
            account_state=AccountState.ACTIVE,
        )

    def setUp(self) -> None:
        # The signer reads its keyring from the environment (P4, V3).
        key = base64.b64encode(b"x" * 32).decode()
        os.environ["CERT_HMAC_KEYRING"] = json.dumps({"k1": key})
        os.environ["CERT_HMAC_ACTIVE_KEY_ID"] = "k1"
        self.addCleanup(os.environ.pop, "CERT_HMAC_KEYRING", None)
        self.addCleanup(os.environ.pop, "CERT_HMAC_ACTIVE_KEY_ID", None)

        self.draft = OnboardingDraft.objects.create(
            institution_name="IIT Kharagpur",
            club_name="NDLI Club IITKGP",
            zone_code=self.zone.code,
            state_code=self.state.code,
            district_code=self.district.code,
            aishe_code="C-1234",
            resume_token_hash="a" * 64,
            resume_token_expires_at=timezone.now() + timedelta(days=7),
        )
        for role in (
            AuthorityRole.PATRON,
            AuthorityRole.PRESIDENT,
            AuthorityRole.SECRETARY,
            AuthorityRole.EXECUTIVE,
        ):
            OnboardingAuthority.objects.create(
                draft=self.draft,
                role=role,
                full_name=f"{role.title()} One",
                email=f"{role}@iitkgp.test",
                phone="9876543210",
                designation="Faculty",
                otp_verified_at=timezone.now(),
            )
        self.application = CharterApplication.objects.create(
            draft=self.draft,
            institution_name=self.draft.institution_name,
            club_name=self.draft.club_name,
            zone_code=self.draft.zone_code,
            state_code=self.draft.state_code,
            district_code=self.draft.district_code,
            status=CharterApplication.Status.QUEUED,
        )

    def _sanction(self):
        return review_charter(
            application_id=self.application.pk,
            user=self.officer,
            decision="sanction",
            reason="charter verified",
        )

    # --- happy path -----------------------------------------------------

    def test_sanction_materialises_club_and_certificate(self):
        self._sanction()
        self.assertTrue(Institution.objects.filter(name="IIT Kharagpur").exists())
        club = Club.objects.get(name="NDLI Club IITKGP")
        self.assertEqual(club.institution.state, self.state)
        self.assertEqual(AuthorityAssignment.objects.filter(club=club).count(), 4)
        cert = Certificate.objects.get(club=club)
        self.assertEqual(cert.category, CertificateCategory.CLUB_REGISTRATION)
        self.assertTrue(is_valid_certificate_id(cert.certificate_id))
        self.assertTrue(
            signing.verify_signature(cert, signing.canonical_payload_for(cert))
        )
        anchor = CharterMaterialisation.objects.get(application=self.application)
        self.assertEqual(anchor.certificate, cert)

    def test_holder_is_most_senior_authority(self):
        self._sanction()
        cert = Certificate.objects.get()
        self.assertEqual(cert.holder.email, "patron@iitkgp.test")

    def test_accounts_provisioned_with_tier_sub_roles(self):
        self._sanction()
        expected = {
            "patron@iitkgp.test": SubRole.CLUB_PATRON,
            "president@iitkgp.test": SubRole.CLUB_PRESIDENT,
            "secretary@iitkgp.test": SubRole.CLUB_SECRETARY,
            "executive@iitkgp.test": SubRole.CLUB_EXECUTIVE,
        }
        for email, sub_role in expected.items():
            user = get_user_model().objects.get(email=email)
            self.assertEqual(user.sub_role, sub_role)
            self.assertEqual(user.account_state, AccountState.ACTIVE)
        club = Club.objects.get()
        self.assertEqual(
            set(
                AuthorityAssignment.objects.filter(club=club).values_list(
                    "tier", flat=True
                )
            ),
            {
                AuthorityRole.PATRON,
                AuthorityRole.PRESIDENT,
                AuthorityRole.SECRETARY,
                AuthorityRole.EXECUTIVE,
            },
        )

    def test_existing_account_reused_not_duplicated(self):
        get_user_model().objects.create_user(
            username="patron_existing",
            email="patron@iitkgp.test",
            password="Str0ng-Passw0rd!",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PATRON,
            account_state=AccountState.ACTIVE,
        )
        self._sanction()
        self.assertEqual(
            get_user_model().objects.filter(email__iexact="patron@iitkgp.test").count(),
            1,
        )

    # --- idempotency + state machine ------------------------------------

    def test_materialise_is_idempotent(self):
        self._sanction()
        again = materialise_charter(application=self.application)
        self.assertEqual(CharterMaterialisation.objects.count(), 1)
        self.assertEqual(Certificate.objects.count(), 1)
        self.assertEqual(again.pk, CharterMaterialisation.objects.get().pk)

    def test_review_then_sanction_flow(self):
        review_charter(
            application_id=self.application.pk,
            user=self.officer,
            decision="review",
        )
        self.application.refresh_from_db()
        self.assertEqual(
            self.application.status, CharterApplication.Status.UNDER_REVIEW
        )
        self._sanction()
        self.assertTrue(CharterMaterialisation.objects.exists())

    def test_reject_materialises_nothing(self):
        review_charter(
            application_id=self.application.pk,
            user=self.officer,
            decision="reject",
            reason="docs mismatch",
        )
        self.assertFalse(CharterMaterialisation.objects.exists())
        self.assertFalse(Institution.objects.exists())
        self.assertFalse(Certificate.objects.exists())

    # --- audit + fail-fast ----------------------------------------------

    def test_audit_trail_written(self):
        self._sanction()
        self.assertTrue(AuditLog.objects.filter(action="charter.sanction").exists())
        self.assertTrue(AuditLog.objects.filter(action="charter.materialised").exists())

    def test_unknown_state_aborts_clean(self):
        self.application.state_code = "XX-NOPE"
        self.application.save(update_fields=["state_code"])
        with self.assertRaises(GovernanceError):
            self._sanction()
        self.assertFalse(Institution.objects.exists())
        self.assertFalse(Club.objects.exists())
        self.assertFalse(AuthorityAssignment.objects.exists())

    def test_not_sanctioned_raises(self):
        with self.assertRaises(GovernanceError):
            materialise_charter(application=self.application)


class CharterDeskAPITests(TestCase):
    """D2c adversarial pins: EMP03 ↛ EMP05 (cross-zone = 404, never data)."""

    # Fixture attributes created in setUpTestData/setUp (declared for mypy).
    app_n1: Any
    app_n2: Any
    central: Any
    club_admin: Any
    emp03: Any
    emp05: Any
    state_n1: State
    state_n2: State
    zone_n1: Zone
    zone_n2: Zone

    @classmethod
    def setUpTestData(cls) -> None:
        cls.zone_n1 = Zone.objects.create(code="N1", name="North 1")
        cls.zone_n2 = Zone.objects.create(code="W1", name="West 1")
        cls.state_n1 = State.objects.create(
            code="UP", name="Uttar Pradesh", zone=cls.zone_n1
        )
        cls.state_n2 = State.objects.create(
            code="MH", name="Maharashtra", zone=cls.zone_n2
        )
        User = get_user_model()
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
            zone_code=cls.zone_n2.code,
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
        cls.club_admin = User.objects.create_user(
            username="clubadmin1",
            email="clubadmin1@example.test",
            password=None,
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            account_state=AccountState.ACTIVE,
        )

    def setUp(self) -> None:
        # The signer reads its keyring from the environment (same seam as
        # CharterMaterialisationTests — sanction materialises a certificate).
        key = base64.b64encode(b"x" * 32).decode()
        os.environ["CERT_HMAC_KEYRING"] = json.dumps({"k1": key})
        os.environ["CERT_HMAC_ACTIVE_KEY_ID"] = "k1"
        self.addCleanup(os.environ.pop, "CERT_HMAC_KEYRING", None)
        self.addCleanup(os.environ.pop, "CERT_HMAC_ACTIVE_KEY_ID", None)

        self.app_n1 = self._make_application(
            draft_id="1" * 32,
            institution="N1 Institute",
            club="N1 Club",
            state_code=self.state_n1.code,
            zone_code=self.zone_n1.code,
        )
        self.app_n2 = self._make_application(
            draft_id="2" * 32,
            institution="W1 Institute",
            club="W1 Club",
            state_code=self.state_n2.code,
            zone_code=self.zone_n2.code,
        )

    @staticmethod
    def _make_application(*, draft_id, institution, club, state_code, zone_code):
        draft = OnboardingDraft.objects.create(
            institution_name=institution,
            club_name=club,
            zone_code=zone_code,
            state_code=state_code,
            resume_token_hash=draft_id,
            resume_token_expires_at=timezone.now() + timedelta(days=7),
        )
        # materialise_charter fail-fasts with no_authorities on an empty set.
        for role in (
            AuthorityRole.PATRON,
            AuthorityRole.PRESIDENT,
            AuthorityRole.SECRETARY,
            AuthorityRole.EXECUTIVE,
        ):
            OnboardingAuthority.objects.create(
                draft=draft,
                role=role,
                full_name=f"{role.title()} One",
                email=f"{role}.{draft_id[:4]}@example.test",
                phone="9876543210",
                designation="Faculty",
                otp_verified_at=timezone.now(),
            )
        return CharterApplication.objects.create(
            draft=draft,
            institution_name=institution,
            club_name=club,
            zone_code=zone_code,
            state_code=state_code,
            status=CharterApplication.Status.QUEUED,
        )

    @staticmethod
    def _make_upload(draft, content: bytes) -> OnboardingUpload:
        import hashlib

        from apps.onboarding.services import _upload_root

        stored_name = hashlib.sha256(content).hexdigest()
        target = _upload_root() / stored_name[:2] / stored_name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return OnboardingUpload.objects.create(
            draft=draft,
            original_name="charter.pdf",
            stored_name=stored_name,
            mime_type="application/pdf",
            size_bytes=len(content),
        )

    def _login(self, user) -> None:
        self.client.force_login(user)
        session = self.client.session
        session["mfa_verified"] = True
        session.save()

    # --- queue scoping ---------------------------------------------------

    def test_queue_scoped_to_own_zone(self):
        self._login(self.emp03)
        response = self.client.get(reverse("governance:charter-queue"))
        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        self.assertEqual([r["id"] for r in results], [str(self.app_n1.pk)])

    def test_central_admin_sees_all_zones(self):
        self._login(self.central)
        response = self.client.get(reverse("governance:charter-queue"))
        self.assertEqual(response.json()["count"], 2)

    # --- cross-zone: 404, never data (EMP03 ↛ EMP05) ---------------------

    def test_cross_zone_detail_is_404(self):
        self._login(self.emp03)
        response = self.client.get(
            reverse("governance:charter-detail", args=[self.app_n2.pk])
        )
        self.assertEqual(response.status_code, 404)

    def test_cross_zone_decision_is_404_and_touches_nothing(self):
        self._login(self.emp03)
        response = self.client.post(
            reverse("governance:charter-decision", args=[self.app_n2.pk]),
            {"decision": "sanction", "reason": "hostile"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        self.app_n2.refresh_from_db()
        self.assertEqual(self.app_n2.status, CharterApplication.Status.QUEUED)
        self.assertFalse(CharterMaterialisation.objects.exists())

    def test_cross_zone_upload_is_404(self):
        upload = self._make_upload(self.app_n2.draft, b"%PDF-w1-secret")
        self._login(self.emp03)
        response = self.client.get(
            reverse("governance:charter-upload", args=[self.app_n2.pk, upload.pk])
        )
        self.assertEqual(response.status_code, 404)

    # --- door discipline -------------------------------------------------

    def test_unauthenticated_blocked(self):
        response = self.client.get(reverse("governance:charter-queue"))
        self.assertIn(response.status_code, (401, 403))

    def test_non_decider_blocked(self):
        self._login(self.club_admin)
        response = self.client.get(reverse("governance:charter-queue"))
        self.assertEqual(response.status_code, 403)

    # --- decision endpoint semantics -------------------------------------

    def test_decision_ignores_status_mass_assignment(self):
        self._login(self.emp03)
        response = self.client.post(
            reverse("governance:charter-decision", args=[self.app_n1.pk]),
            {"decision": "review", "reason": "checking", "status": "sanctioned"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.app_n1.refresh_from_db()
        self.assertEqual(self.app_n1.status, CharterApplication.Status.UNDER_REVIEW)

    def test_decision_sanction_materialises_via_api(self):
        self._login(self.emp03)
        response = self.client.post(
            reverse("governance:charter-decision", args=[self.app_n1.pk]),
            {"decision": "sanction", "reason": "verified"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(CharterMaterialisation.objects.exists())

    # --- detail + upload serving -----------------------------------------

    def test_detail_lists_upload_metadata_without_urls(self):
        self._make_upload(self.app_n1.draft, b"%PDF-n1")
        self._login(self.emp03)
        response = self.client.get(
            reverse("governance:charter-detail", args=[self.app_n1.pk])
        )
        self.assertEqual(response.status_code, 200)
        uploads = response.json()["uploads"]
        self.assertEqual(len(uploads), 1)
        self.assertNotIn("url", uploads[0])
        self.assertEqual(uploads[0]["original_name"], "charter.pdf")

    def test_upload_served_scoped_bytes_match(self):
        content = b"%PDF-n1-bytes"
        upload = self._make_upload(self.app_n1.draft, content)
        self._login(self.emp03)
        response = self.client.get(
            reverse("governance:charter-upload", args=[self.app_n1.pk, upload.pk])
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(cast(Any, response).streaming_content), content)
