"""Identity models for the Accounts app (milestone M1).

M1 ships the identity + access-control spine only. Domain models (Zone /
State / Institution / Club / Authority / Membership) arrive in M2; the
scoping keys below are plain audited fields on the profile until then
(docs/ASSUMPTIONS.md, M1-A1).

There is deliberately NO phone/SMS delivery model anywhere in this app:
mobile numbers are human contact records for the F5 break-glass handover
only (BRIEF_M1.md §2b), never a code delivery channel.
"""
from __future__ import annotations

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser
from django.db import models


class Category(models.TextChoices):
    """The four top-level categories of PLAN_ACCESS_ARCHITECTURE.md §1."""

    GENERAL_PUBLIC = "general_public"
    CLUB_ADMIN = "club_admin"
    STUDENT_MEMBER = "student_member"
    IIT_KGP_ADMIN = "iit_kgp_admin"


class SubRole(models.TextChoices):
    """The nine sub-roles of PLAN_ACCESS_ARCHITECTURE.md §3."""

    ANONYMOUS = "anonymous"
    CLUB_EXECUTIVE = "club_executive"
    CLUB_SECRETARY = "club_secretary"
    CLUB_PRESIDENT = "club_president"
    CLUB_PATRON = "club_patron"
    STUDENT_MEMBER = "student_member"
    CENTRAL_ADMIN = "central_admin"
    REGIONAL_OFFICER = "regional_officer"
    SUPER_ADMIN_OPS = "super_admin_ops"


#: Explicit display labels (derived labels mangle acronyms).
CATEGORY_CHOICES = [
    (Category.GENERAL_PUBLIC, "General Public"),
    (Category.CLUB_ADMIN, "Club Admin"),
    (Category.STUDENT_MEMBER, "Student Member"),
    (Category.IIT_KGP_ADMIN, "IIT KGP Admin"),
]

#: Sub-roles that make up the Club Admin category (the 4 authority tiers).
CLUB_AUTHORITY_SUB_ROLES = frozenset(
    {
        SubRole.CLUB_EXECUTIVE,
        SubRole.CLUB_SECRETARY,
        SubRole.CLUB_PRESIDENT,
        SubRole.CLUB_PATRON,
    }
)

#: Sub-roles that make up the IIT Kgp Admin category (Module 3).
IIT_KGP_ADMIN_SUB_ROLES = frozenset(
    {
        SubRole.CENTRAL_ADMIN,
        SubRole.REGIONAL_OFFICER,
        SubRole.SUPER_ADMIN_OPS,
    }
)


#: Explicit display labels for the nine sub-roles (PLAN §3).
SUB_ROLE_CHOICES = [
    (SubRole.ANONYMOUS, "Anonymous"),
    (SubRole.CLUB_EXECUTIVE, "Club Executive"),
    (SubRole.CLUB_SECRETARY, "Club Secretary"),
    (SubRole.CLUB_PRESIDENT, "Club President"),
    (SubRole.CLUB_PATRON, "Club Patron"),
    (SubRole.STUDENT_MEMBER, "Student Member"),
    (SubRole.CENTRAL_ADMIN, "Central Admin"),
    (SubRole.REGIONAL_OFFICER, "Regional Officer"),
    (SubRole.SUPER_ADMIN_OPS, "Super Admin (ops)"),
]


class AccountState(models.TextChoices):
    """Account lifecycle states (BRIEF_M1.md §2a)."""

    PENDING_APPROVAL = "pending_approval"
    ACTIVE = "active"
    LOCKED = "locked"
    DORMANT = "dormant"


#: Explicit display labels for the account lifecycle states.
ACCOUNT_STATE_CHOICES = [
    (AccountState.PENDING_APPROVAL, "Pending approval"),
    (AccountState.ACTIVE, "Active"),
    (AccountState.LOCKED, "Locked"),
    (AccountState.DORMANT, "Dormant"),
]


class Profile(models.Model):
    """Per-user identity record: category, sub-role, scope keys and MFA state.

    Every field that carries scope (institution/zone/club) is a plain,
    audited field here in M1 and becomes a real foreign key in M2.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    category = models.CharField(max_length=32, choices=CATEGORY_CHOICES)
    sub_role = models.CharField(max_length=32, choices=SUB_ROLE_CHOICES)

    # --- Scope keys (plain fields in M1; real FKs in M2; A1) --------------
    institution_code = models.CharField(max_length=64, blank=True, default="")
    club_code = models.CharField(max_length=64, blank=True, default="")
    zone_code = models.CharField(max_length=64, blank=True, default="")
    state_code = models.CharField(max_length=64, blank=True, default="")

    # --- Human contact records (F1). NEVER a delivery channel -------------
    phone = models.CharField(max_length=32, blank=True, default="")
    alt_phone = models.CharField(max_length=32, blank=True, default="")

    # --- Lifecycle --------------------------------------------------------
    account_state = models.CharField(
        max_length=32,
        choices=ACCOUNT_STATE_CHOICES,
        default=AccountState.PENDING_APPROVAL,
    )
    must_change_password = models.BooleanField(default=False)

    # --- Staff MFA (TOTP, RFC 6238) --------------------------------------
    totp_secret_encrypted = models.TextField(blank=True, default="")
    totp_enabled = models.BooleanField(default=False)
    totp_last_counter = models.BigIntegerField(null=True, blank=True)

    # --- Login throttling / lockout --------------------------------------
    failed_login_count = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["category", "sub_role"]),
            models.Index(fields=["institution_code"]),
            models.Index(fields=["club_code"]),
            models.Index(fields=["zone_code"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.user.username} ({self.sub_role})"


class EmailOTP(models.Model):
    """Email-only one-time code (BRIEF_M1.md §2a).

    6-digit, single-use, TTL 10 min, max 5 sends/hour/recipient, max 5
    verify attempts then a 15-minute lockout. The code value is stored
    hashed ONLY. There is no SMS counterpart anywhere in the product.
    """

    recipient_email = models.EmailField()
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="email_otps",
    )
    purpose = models.CharField(max_length=64, default="email_verification")
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["recipient_email", "purpose", "created_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"EmailOTP({self.recipient_email}, {self.purpose})"


class EmailLinkToken(models.Model):
    """Single-use 32-byte link token for the F2 welcome / F4 forgot flows.

    The token value is stored hashed and bound to the account + purpose;
    it is delivered ONLY inside an email (URL fragment, never a query
    string, never an API URL).
    """

    class Purpose(models.TextChoices):
        WELCOME_CHANGE_PASSWORD = "welcome_change_password"
        FORGOT_PASSWORD = "forgot_password"

    #: Explicit display labels for the single-use link purposes.
    PURPOSE_CHOICES = [
        (Purpose.WELCOME_CHANGE_PASSWORD, "Welcome change-password link"),
        (Purpose.FORGOT_PASSWORD, "Forgot-password link"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_link_tokens",
    )
    purpose = models.CharField(max_length=64, choices=PURPOSE_CHOICES)
    token_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["purpose", "token_hash"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"EmailLinkToken({self.user_id}, {self.purpose})"


class ClubPasskey(models.Model):
    """Official Institutional Passkey — ONE PER CLUB (BRIEF_M1.md F5 / A6).

    Generated by the system at club onboarding (M2/M4) and delivered via an
    official channel; stored hashed; rotatable (rotation is audited and the
    old value is invalidated). This is NOT the student campus passkey.
    """

    club_code = models.CharField(max_length=64, unique=True)
    passkey_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    rotated_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    failed_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"ClubPasskey({self.club_code})"


class TOTPRecoveryCode(models.Model):
    """One-time recovery code for staff MFA (BRIEF_M1.md §2c)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="totp_recovery_codes",
    )
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"TOTPRecoveryCode({self.user_id})"


def profile_of(user: AbstractBaseUser) -> Profile:
    """Typed accessor for the one-to-one ``Profile`` relation (M1-A10).

    ``user.profile`` is a related descriptor django-stubs cannot see; this
    helper keeps the single ``type: ignore`` in one place instead of
    sprinkling it over every caller.
    """
    return user.profile  # type: ignore[attr-defined]
