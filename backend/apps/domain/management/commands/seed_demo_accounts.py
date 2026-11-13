"""Create demo accounts for portal verification without an email server.

This is DEMO TEST DATA intended for live-portal verification only.
All demo accounts use @demo.ndli.gov.in emails
and MUST be cleaned before client handover.

Creates the minimum set of accounts needed when no email server is deployed:

    * 2 institution Club Admin accounts (ACTIVE) — category ``club_admin``,
      sub-role ``club_president``: BHU + IIT Kharagpur club dashboards with
      full read+edit inside their own club scope. NOT central admin (owner
      fix 2026-11-08: the first demo pair was wrongly scoped as IIT Kgp
      Central Admin and is purged by this command on every run).
    * 2 HEI Student Member accounts (ACTIVE, no email verification needed)

Schools do NOT have individual student dashboards per requirements §G.a
(lines 296/299/302/305). School access is through the institution authority
(President) accounts already seeded by 0012_seed_dummy_schools migration.
Student/club member dashboards belong ONLY to HEI students.

Runs against your target environment after deployment.

Usage:
    python manage.py seed_demo_accounts        # create all demo accounts
    python manage.py seed_demo_accounts --clean  # delete all demo account data

Single source of truth: this is the ONLY command that creates demo accounts.
It is idempotent (safe to run multiple times). Every account creation is
written to the immutable AuditLog via apps.audit.services.record().

Passwords are generated RANDOMLY at first creation and printed to the
console exactly once (C3 closure 2026-11-13): the repository never holds a
usable demo credential, and re-runs refresh scope/flags but NEVER rewrite an
existing account's password. Accounts are created with
must_change_password=False so they have FULL functional access from first
login (the enforced password-change modal exists but never triggers for
them). Demo data is purged at client handover.
"""

from __future__ import annotations

import secrets
import string
from datetime import date

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from rest_framework.exceptions import ValidationError

from apps.accounts.models import AccountState, Category, SubRole, User
from apps.accounts.passwords import validate_password_strength
from apps.audit import services as audit_services
from apps.domain.models import AuthorityAssignment, Club, Institution, Membership
from apps.members.models import StudentMemberProfile

# --- Demo account specifications -------------------------------------------

# Each club admin maps to an existing canonical institution + club
# (seeded by 0004_seed_canonical_institutional_clubs migration).
#
# SCOPE FIX 2026-11-08 (owner): the first demo pair was created with
# category IIT_KGP_ADMIN / sub-role CENTRAL_ADMIN and therefore logged into
# the IIT Kgp CENTRAL ADMIN dashboard — an unwanted duplicate of the real
# central-admin login and a security/ambiguity risk. The pair below is
# category CLUB_ADMIN / sub-role CLUB_PRESIDENT: full read+edit of the OWN
# club's dashboard (BHU + IIT Kharagpur), never the admin module.
CLUB_ADMINS: list[dict[str, object]] = [
    {
        "username": "demo.club.bhu",
        "email": "demo.club.bhu@ndli.gov.in",
        "first_name": "Demo Club",
        "last_name": "BHU",
        "category": Category.CLUB_ADMIN,
        "sub_role": SubRole.CLUB_PRESIDENT,
        "institution_code": "INST-BHU-008",
        "club_code": "CLUB-BHU-008",
        "state_code": "UTTAR_PRADESH",
        "zone_code": "NORTH",
        "authority_tier": AuthorityAssignment.Tier.PRESIDENT,
        "authority_from": date(2026, 11, 8),
    },
    {
        "username": "demo.club.iitkgp",
        "email": "demo.club.iitkgp@ndli.gov.in",
        "first_name": "Demo Club",
        "last_name": "IITKGP",
        "category": Category.CLUB_ADMIN,
        "sub_role": SubRole.CLUB_PRESIDENT,
        "institution_code": "INST-IITKGP-001",
        "club_code": "CLUB-IITKGP-001",
        "state_code": "WEST_BENGAL",
        "zone_code": "EAST",
        "authority_tier": AuthorityAssignment.Tier.PRESIDENT,
        "authority_from": date(2026, 11, 8),
    },
]

# Each HEI student member maps to an existing canonical HEI institution + club.
# Student/club member dashboards belong ONLY to HEI students per §G.a.
HEI_STUDENT_MEMBERS: list[dict[str, object]] = [
    {
        "username": "demo.member.dati",
        "email": "demo.member.dati@ndli.gov.in",
        "first_name": "Demo Student",
        "last_name": "DATI",
        "category": Category.STUDENT_MEMBER,
        "sub_role": SubRole.STUDENT_MEMBER,
        "institution_code": "INST-DATI-001",
        "club_code": "NDLI-EMP01-002",
        "state_code": "DELHI",
        "zone_code": "NORTH",
        "department": "Computer Science",
        "roll_number": "DEMO-DATI-001",
    },
    {
        "username": "demo.member.iitkgp",
        "email": "demo.member.iitkgp@ndli.gov.in",
        "first_name": "Demo Student",
        "last_name": "IITKGP",
        "category": Category.STUDENT_MEMBER,
        "sub_role": SubRole.STUDENT_MEMBER,
        "institution_code": "INST-IITKGP-001",
        "club_code": "CLUB-IITKGP-001",
        "state_code": "WEST_BENGAL",
        "zone_code": "EAST",
        "department": "Computer Science",
        "roll_number": "DEMO-IITKGP-001",
    },
]


# --- Helper functions --------------------------------------------------------

#: Alphabet for generated demo credentials: upper/lower/digit/symbol mix.
_PASSWORD_ALPHABET = string.ascii_letters + string.digits + "!@#%-_"


def _generate_password() -> str:
    """A random 18-character password that satisfies the M1 policy.

    Generated once, at account creation, and printed to the console — the
    repository deliberately holds no usable demo credential (C3 closure,
    2026-11-13). Re-runs never rewrite an existing account's password, so
    the value shown at first creation stays valid until --clean.
    """
    while True:
        password = "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(18))
        if not (
            any(c.islower() for c in password)
            and any(c.isupper() for c in password)
            and any(c.isdigit() for c in password)
            and any(c in "!@#%-_" for c in password)
        ):
            continue
        try:
            validate_password_strength(password)
        except ValidationError:
            continue
        return password


def _resolve_domain(spec: dict):
    """Resolve Institution, Club, State, Zone from a spec dict."""
    inst = Institution.objects.filter(code=spec["institution_code"]).first()
    if not inst:
        raise CommandError(
            f"Institution {spec['institution_code']} not found. "
            "Run 0004_seed_canonical_institutional_clubs first."
        )
    club = Club.objects.filter(code=spec["club_code"]).first()
    if not club:
        raise CommandError(
            f"Club {spec['club_code']} not found. "
            "Run 0004_seed_canonical_institutional_clubs first."
        )
    state = None
    if spec.get("state_code"):
        state = (
            __import__("django.apps", fromlist=["apps"])
            .apps.get_model("domain", "State")
            .objects.filter(code=spec["state_code"])
            .first()
        )
    zone = None
    if spec.get("zone_code"):
        zone = (
            __import__("django.apps", fromlist=["apps"])
            .apps.get_model("domain", "Zone")
            .objects.filter(code=spec["zone_code"])
            .first()
        )
    return inst, club, state, zone


def _audit_demo(
    action: str,
    actor_label: str,
    object_type: str,
    object_id: str,
    category: str = "",
    institution_code: str = "",
    zone_code: str = "",
    outcome: str = "success",
    detail: dict | None = None,
) -> None:
    """Write one immutable audit row for a demo-account lifecycle event."""
    audit_services.record(
        action=action,
        request=None,
        actor_label=actor_label,
        outcome=outcome,
        object_type=object_type,
        object_id=str(object_id),
        category=category,
        institution_code=institution_code,
        zone_code=zone_code,
        detail=detail or {},
    )


def _create_or_update_club_admin(
    spec: dict, created_list: list[dict[str, str | bool]]
) -> None:
    """Create or update an institution Club Admin demo account."""
    inst, club, state, zone = _resolve_domain(spec)

    # Fresh random credential: applied ONLY when the account is created —
    # existing accounts keep the password the operator saved at first run.
    password = _generate_password()

    user, was_created = User.objects.get_or_create(
        username=spec["username"],
        defaults={
            "email": spec["email"],
            "category": spec["category"],
            "sub_role": spec["sub_role"],
            "account_state": AccountState.ACTIVE,
            "first_name": spec["first_name"],
            "last_name": spec["last_name"],
            "is_active": True,
            "club": club,
            "institution": inst,
            "state": state,
            "zone": zone,
            "password": make_password(password),
            "must_change_password": False,
        },
    )

    if not was_created:
        # Idempotent update: refresh scope keys. The credential generated at
        # creation is NEVER rewritten — re-running must not invalidate the
        # password saved from the first creation output.
        user.email = spec["email"]
        user.category = spec["category"]
        user.sub_role = spec["sub_role"]
        user.account_state = AccountState.ACTIVE
        user.is_active = True
        user.club = club
        user.institution = inst
        user.state = state
        user.zone = zone
        user.must_change_password = False
        user.save(
            update_fields=[
                "email",
                "category",
                "sub_role",
                "account_state",
                "is_active",
                "club",
                "institution",
                "state",
                "zone",
                "must_change_password",
                "updated_at",
            ]
        )

    # AuthorityAssignment (idempotent)
    AuthorityAssignment.objects.update_or_create(
        user=user,
        club=club,
        tier=spec["authority_tier"],
        defaults={
            "from_date": spec["authority_from"],
            "to_date": None,
            "status": AuthorityAssignment.Status.ACTIVE,
        },
    )

    _audit_demo(
        action="demo.club_admin.create",
        actor_label="seed_demo_accounts",
        object_type="user",
        object_id=user.username,
        category=str(user.category),
        institution_code=inst.code,
        zone_code=zone.code if zone else "",
        detail={
            "email": user.email,
            "sub_role": user.sub_role,
            "club_code": club.code,
            "institution_code": inst.code,
            "demo": True,
            "created": was_created,
        },
    )

    created_list.append(
        {
            "type": "Club Admin",
            "username": user.username,
            "email": user.email,
            "password": password if was_created else "(unchanged — first creation)",
            "institution": inst.name,
            "club": club.name,
            "created": was_created,
        }
    )


def _create_or_update_hei_student_member(
    spec: dict, created_list: list[dict[str, str | bool]]
) -> None:
    """Create or update a HEI Student Member demo account."""
    inst, club, state, zone = _resolve_domain(spec)

    # Fresh random credential: applied ONLY when the account is created —
    # existing accounts keep the password the operator saved at first run.
    password = _generate_password()

    user, was_created = User.objects.get_or_create(
        username=spec["username"],
        defaults={
            "email": spec["email"],
            "category": spec["category"],
            "sub_role": spec["sub_role"],
            "account_state": AccountState.ACTIVE,
            "first_name": spec["first_name"],
            "last_name": spec["last_name"],
            "is_active": True,
            "club": club,
            "institution": inst,
            "state": state,
            "zone": zone,
            "password": make_password(password),
            "must_change_password": False,
        },
    )

    if not was_created:
        user.email = spec["email"]
        user.category = spec["category"]
        user.sub_role = spec["sub_role"]
        user.account_state = AccountState.ACTIVE
        user.is_active = True
        user.club = club
        user.institution = inst
        user.state = state
        user.zone = zone
        user.must_change_password = False
        user.save(
            update_fields=[
                "email",
                "category",
                "sub_role",
                "account_state",
                "is_active",
                "club",
                "institution",
                "state",
                "zone",
                "must_change_password",
                "updated_at",
            ]
        )

    # Membership (idempotent)
    Membership.objects.update_or_create(
        user=user,
        club=club,
        defaults={
            "role": Membership.Role.MEMBER,
            "status": Membership.Status.ACTIVE,
            "joined_on": date.today(),
        },
    )

    # StudentMemberProfile (idempotent)
    StudentMemberProfile.objects.update_or_create(
        user=user,
        club=club,
        defaults={
            "gender": "other",
            "department": spec.get("department", ""),
            "roll_number": spec.get("roll_number", ""),
            "validity_years": 1,
            "valid_until": None,
        },
    )

    _audit_demo(
        action="demo.hei_student_member.create",
        actor_label="seed_demo_accounts",
        object_type="user",
        object_id=user.username,
        category=str(user.category),
        institution_code=inst.code,
        zone_code=zone.code if zone else "",
        detail={
            "email": user.email,
            "sub_role": user.sub_role,
            "club_code": club.code,
            "institution_code": inst.code,
            "department": spec.get("department", ""),
            "roll_number": spec.get("roll_number", ""),
            "demo": True,
            "created": was_created,
        },
    )

    created_list.append(
        {
            "type": "HEI Student Member",
            "username": user.username,
            "email": user.email,
            "password": password if was_created else "(unchanged — first creation)",
            "institution": inst.name,
            "club": club.name,
            "department": spec.get("department", ""),
            "roll_number": spec.get("roll_number", ""),
            "created": was_created,
        }
    )


def _purge_legacy_central_admin_demos() -> list[str]:
    """Delete the wrongly-scoped demo pair (owner fix 2026-11-08).

    ``demo.pres.dati`` / ``demo.pres.iitkgp`` were created as IIT Kgp
    Central Admins and logged into the central-admin dashboard — an
    unwanted duplicate login surface. Removed on every create run so
    existing databases converge; every deletion is audited.
    """
    removed: list[str] = []
    for username in ("demo.pres.dati", "demo.pres.iitkgp"):
        user = User.objects.filter(username=username).first()
        if user is None:
            continue
        detail = {
            "email": user.email,
            "legacy_category": str(user.category),
            "legacy_sub_role": str(user.sub_role),
            "demo": True,
        }
        user.delete()
        removed.append(username)
        _audit_demo(
            action="demo.legacy_scope.revoke",
            actor_label="seed_demo_accounts",
            object_type="user",
            object_id=username,
            detail=detail,
        )
    return removed


def _clean_demo_data() -> int:
    """Delete all demo account data created by this command."""
    demo_emails = [
        # Legacy wrongly-scoped pair (central-admin scope, purged on sight).
        "demo.pres.dati@ndli.gov.in",
        "demo.pres.iitkgp@ndli.gov.in",
        # Current pair.
        "demo.club.bhu@ndli.gov.in",
        "demo.club.iitkgp@ndli.gov.in",
        "demo.member.dati@ndli.gov.in",
        "demo.member.iitkgp@ndli.gov.in",
    ]

    deleted = 0
    for email in demo_emails:
        count, _ = User.objects.filter(email__iexact=email).delete()
        deleted += count

    _audit_demo(
        action="demo.accounts.clean",
        actor_label="seed_demo_accounts",
        object_type="user",
        object_id="all_demo",
        detail={"deleted_count": deleted, "demo": True},
    )

    return deleted


# --- Management command ------------------------------------------------------


class Command(BaseCommand):
    help = (
        "Create demo accounts (2 institution Club Admin + "
        "2 HEI Student Member) "
        "for portal verification without an email server. "
        "Demo test data — clean before client handover. "
        "Schools do NOT have individual student dashboards; school access is "
        "through the institution authority (President) accounts seeded by "
        "0012_seed_dummy_schools."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--clean",
            action="store_true",
            help="Delete all demo account data created by this command.",
        )

    def handle(self, *args, **options):
        if options["clean"]:
            deleted = _clean_demo_data()
            self.stdout.write(
                self.style.SUCCESS(
                    f"Demo account data cleaned ({deleted} user(s) deleted)."
                )
            )
            return

        created: list[dict[str, str | bool]] = []

        # The wrongly-scoped central-admin demo pair must not survive.
        for username in _purge_legacy_central_admin_demos():
            self.stdout.write(
                self.style.WARNING(
                    f"Removed legacy wrongly-scoped demo account: {username}"
                )
            )

        # --- Institution Club Admins (club dashboard, own club scope) ---
        for spec in CLUB_ADMINS:
            self.stdout.write(
                f"\nCreating Club Admin: "
                f"{spec['first_name']} {spec['last_name']} "
                f"({spec['email']})"
            )
            try:
                _create_or_update_club_admin(spec, created)
            except CommandError as exc:
                raise CommandError(f"Failed to create {spec['email']}: {exc}") from exc

        # --- HEI Student Members ---
        for spec in HEI_STUDENT_MEMBERS:
            self.stdout.write(
                f"\nCreating HEI Student Member: "
                f"{spec['first_name']} {spec['last_name']} "
                f"({spec['email']})"
            )
            try:
                _create_or_update_hei_student_member(spec, created)
            except CommandError as exc:
                raise CommandError(f"Failed to create {spec['email']}: {exc}") from exc

        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS("ALL DEMO ACCOUNTS PROCESSED"))
        self.stdout.write("=" * 60 + "\n")
        for c in created:
            self.stdout.write(f"  Type: {c['type']}")
            self.stdout.write(f"    Username: {c['username']}")
            self.stdout.write(f"    Email: {c['email']}")
            self.stdout.write(f"    Password: {c['password']}")
            self.stdout.write(f"    Institution: {c['institution']}")
            self.stdout.write(f"    Club: {c['club']}")
            if "department" in c:
                self.stdout.write(f"    Department: {c['department']}")
            if "roll_number" in c:
                self.stdout.write(f"    Roll Number: {c['roll_number']}")
            self.stdout.write(f"    Newly created: {c['created']}")
            self.stdout.write("")

        self.stdout.write(
            self.style.WARNING(
                "NOTE: These are DEMO accounts. Clean before client handover "
                "using: python manage.py seed_demo_accounts --clean\n"
                "School access: "
                "president.{springdale,shreevidya,sunrise,greenvalley,bvb}@school.test "
                "(initial credentials per 0012_seed_dummy_schools; rotate per "
                "environment — never republish them)"
            )
        )
