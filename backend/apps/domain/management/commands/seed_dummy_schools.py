"""Create dummy SCHOOL institutions via the live charter flow (SSOT-compliant).

This is DUMMY TEST DATA intended for live-portal verification only.
All schools use @school.test emails and Dummy123456 passwords and MUST be
cleaned before client handover.

Runs the complete M4→M6 pipeline — no SSOT bypass:

    OnboardingDraft → submit_draft() → CharterApplication(queued) →
    Zone Officer review_charter(sanction) → materialise_charter() →
    Institution + Club + AuthorityAssignments + Certificate + AuditLogs

Usage:
    python manage.py seed_dummy_schools        # create all 5 schools
    python manage.py seed_dummy_schools --clean  # delete all dummy school data

Run against your target environment (local dev first, then production via
Render shell) after deployment.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from datetime import timedelta
from types import SimpleNamespace

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.utils.crypto import get_random_string

from apps.accounts.models import User
from apps.domain.models import Club, Institution
from apps.governance.services import DECISION_SANCTION, review_charter
from apps.onboarding import services as onboarding_services
from apps.onboarding.models import (
    AuthorityRole,
    CharterApplication,
    OnboardingAuthority,
    OnboardingDraft,
    OnboardingUpload,
)

# --- 5 dummy schools across 5 zones ---------------------------------------
SCHOOLS = [
    {
        "institution_name": "Springdale Public School",
        "club_name": "Springdale NDLI Club",
        "state_code": "DELHI",
        "district_code": "DELHI-SOUTH",
        "zone_code": "NORTH",
        "sanctioning_officer": "EMP01",
        "president_email": "president.springdale@school.test",
    },
    {
        "institution_name": "Shree Vidya Mandir",
        "club_name": "Shree Vidya Mandir NDLI Club",
        "state_code": "WEST_BENGAL",
        "district_code": "KOLKATA",
        "zone_code": "EAST",
        "sanctioning_officer": "EMP04",
        "president_email": "president.shreevidya@school.test",
    },
    {
        "institution_name": "Sunrise English School",
        "club_name": "Sunrise NDLI Club",
        "state_code": "MAHARASHTRA",
        "district_code": "PUNE",
        "zone_code": "WEST",
        "sanctioning_officer": "EMP03",
        "president_email": "president.sunrise@school.test",
    },
    {
        "institution_name": "Green Valley High School",
        "club_name": "Green Valley NDLI Club",
        "state_code": "KARNATAKA",
        "district_code": "BENGALURU-URBAN",
        "zone_code": "SOUTH",
        "sanctioning_officer": "EMP06",
        "president_email": "president.greenvalley@school.test",
    },
    {
        "institution_name": "Bharatiya Vidya Bhavan School",
        "club_name": "BVB NDLI Club",
        "state_code": "TAMIL_NADU",
        "district_code": "CHENNAI",
        "zone_code": "SOUTH",
        "sanctioning_officer": "EMP07",
        "president_email": "president.bvb@school.test",
    },
]

DEMO_PASSWORD = "Dummy123456"  # usable password for Demo Sign In (President)


def _configure_cert_keyring() -> None:
    """Set the HMAC signing keyring env vars (read at call time by signer)."""
    dummy_key = base64.b64encode(os.urandom(32)).decode("ascii")
    os.environ["CERT_HMAC_KEYRING"] = json.dumps({"k_demo": dummy_key})
    os.environ["CERT_HMAC_ACTIVE_KEY_ID"] = "k_demo"


def _make_upload(draft: OnboardingDraft) -> OnboardingUpload:
    content = b"NDLI School Charter Registration Document"
    digest = hashlib.sha256(content).hexdigest()
    return OnboardingUpload.objects.update_or_create(
        draft=draft,
        defaults={
            "original_name": "charter_registration.pdf",
            "stored_name": digest,
            "content_sha256": digest,
            "mime_type": "application/pdf",
            "size_bytes": len(content),
        },
    )[0]


def _create_draft_and_authorities(school: dict) -> OnboardingDraft:
    now = timezone.now()
    draft = OnboardingDraft.objects.create(
        institution_type="school",
        institution_name=school["institution_name"],
        club_name=school["club_name"],
        zone_code=school["zone_code"],
        state_code=school["state_code"],
        district_code=school["district_code"],
        resume_token_hash=get_random_string(64),
        resume_token_expires_at=now + timedelta(hours=24),
        status=OnboardingDraft.Status.DRAFT,
    )

    patron_email = f"patron.{school['club_name'].lower().replace(' ', '')}@school.test"
    secretary_email = (
        f"secretary.{school['club_name'].lower().replace(' ', '')}@school.test"
    )

    authorities = [
        {
            "role": AuthorityRole.PATRON,
            "full_name": f"Patron of {school['institution_name']}",
            "email": patron_email,
            "phone": "9876543210",
            "designation": "Principal",
        },
        {
            "role": AuthorityRole.PRESIDENT,
            "full_name": f"President of {school['institution_name']}",
            "email": school["president_email"],
            "phone": "9876543211",
            "designation": "Club President",
        },
        {
            "role": AuthorityRole.SECRETARY,
            "full_name": f"Secretary of {school['institution_name']}",
            "email": secretary_email,
            "phone": "9876543212",
            "designation": "Club Secretary",
        },
    ]
    for auth in authorities:
        OnboardingAuthority.objects.create(
            draft=draft,
            role=auth["role"],
            full_name=auth["full_name"],
            email=auth["email"],
            phone=auth["phone"],
            designation=auth["designation"],
            otp_verified_at=now,
        )

    _make_upload(draft)
    return draft


def _get_officer(employee_username: str) -> User:
    officer = User.objects.filter(username=employee_username).first()
    if officer is None:
        raise CommandError(f"Officer {employee_username} not found in database.")
    if str(officer.sub_role) not in (
        "regional_officer",
        "central_admin",
        "super_admin_ops",
    ):
        raise CommandError(f"Officer {employee_username} is not a charter decider.")
    return officer


def _clean_dummy_data() -> None:
    """Delete all dummy school data created by this command."""
    school_names = [s["institution_name"] for s in SCHOOLS]

    CharterMaterialisation = apps.get_model("governance", "CharterMaterialisation")

    for cm in CharterMaterialisation.objects.all():
        if cm.institution.name in school_names:
            cm.delete()

    CharterApplication.objects.filter(institution_name__in=school_names).delete()

    OnboardingDraft.objects.filter(institution_name__in=school_names).delete()

    Club.objects.filter(institution__name__in=school_names).delete()

    Institution.objects.filter(name__in=school_names).delete()

    User.objects.filter(email__endswith="@school.test").delete()


class Command(BaseCommand):
    help = (
        "Create 5 dummy SCHOOL institutions via the live charter flow "
        "(SSOT-compliant). Dummy test data — clean before client handover."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--clean",
            action="store_true",
            help="Delete all dummy school data created by this command.",
        )

    def handle(self, *args, **options):
        _configure_cert_keyring()

        if options["clean"]:
            _clean_dummy_data()
            self.stdout.write(self.style.SUCCESS("Dummy school data cleaned."))
            return

        created = []
        for school in SCHOOLS:
            self.stdout.write(
                f"\nCreating: {school['institution_name']} ({school['state_code']})"
            )

            # 1. Draft + authorities + upload
            draft = _create_draft_and_authorities(school)
            self.stdout.write(f"  Draft: {draft.id}")

            # 2. Submit draft → CharterApplication(queued)
            application = onboarding_services.submit_draft(draft)
            self.stdout.write(
                f"  CharterApplication: {application.application_id} (queued)"
            )

            # 3. Zone Officer sanctions → materialise_charter() runs automatically
            officer = _get_officer(school["sanctioning_officer"])
            self.stdout.write(
                f"  Officer: {officer.username} ({officer.sub_role}), "
                f"zone={officer.zone_code}"
            )

            mock_request = SimpleNamespace(user=officer, META={})

            sanctioned = review_charter(
                application_id=application.pk,
                user=officer,
                decision=DECISION_SANCTION,
                reason=("Dummy school for testing — clean before client handover."),
                request=mock_request,
            )
            self.stdout.write(f"  Charter sanctioned: status={sanctioned.status}")

            # 4. Verify Institution + Club exist
            inst = Institution.objects.filter(name=school["institution_name"]).first()
            club = Club.objects.filter(name=school["club_name"]).first()
            if not inst or not club:
                raise CommandError(
                    f"Materialisation failed for {school['institution_name']}"
                )
            self.stdout.write(
                f"  Institution: {inst.code} | type={inst.institution_type}"
            )
            self.stdout.write(f"  Club: {club.code}")

            # 5. Set usable password on PRESIDENT account
            president_user = User.objects.filter(
                email__iexact=school["president_email"]
            ).first()
            if president_user:
                president_user.set_password(DEMO_PASSWORD)
                president_user.save(update_fields=["password"])
                self.stdout.write(
                    f"  Demo Sign In: {president_user.username} / {DEMO_PASSWORD}"
                )

            created.append(
                {
                    "institution": school["institution_name"],
                    "state": school["state_code"],
                    "institution_code": inst.code,
                    "club_code": club.code,
                    "president_email": school["president_email"],
                    "demo_password": DEMO_PASSWORD,
                }
            )

        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS("ALL 5 SCHOOLS CREATED SUCCESSFULLY"))
        self.stdout.write("=" * 60 + "\n")
        for s in created:
            self.stdout.write(f"  Institution: {s['institution']}")
            self.stdout.write(f"    State: {s['state']}")
            self.stdout.write(f"    Institution Code: {s['institution_code']}")
            self.stdout.write(f"    Club Code: {s['club_code']}")
            self.stdout.write(
                f"    Demo Sign In (President): {s['president_email']} "
                f"/ {s['demo_password']}"
            )
            self.stdout.write("")
