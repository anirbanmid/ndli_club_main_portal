"""Identity models for the Accounts app (M1 + M2 FK swap + M2U merge).

M1 shipped the identity + access-control spine with the scope keys as plain
audited profile fields; M2 replaced them with real relations to the domain
tables (BRIEF_M2.md §2b, M1-A1 closed). The four relations deliberately keep
the legacy column names and code-string values (``to_field="code"``), so
every M1-era row keeps working unchanged (M2-A5) and the code-string
semantics stay intact through the compat properties below.

M2U merged the side ``Profile`` table INTO this model (A10 Option B, owner
2026-10-19): one person = one record — ``User`` carries authentication AND
identity AND scope. ``Profile`` is gone as a model and as a table; there is
no shim and no alias (M2U-A4).

There is deliberately NO phone/SMS delivery model anywhere in this app:
mobile numbers are human contact records for the F5 break-glass handover
only (BRIEF_M1.md §2b), never a code delivery channel.
"""

from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.contrib.auth.models import AbstractUser
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


class User(AbstractUser):
    """One person = ONE record (M2U): authentication + identity + scope unified.

    Replaces the M1 shape (stock ``auth.User`` + side ``Profile`` table) per
    A10 Option B (owner, 2026-10-19). The merged model first kept the legacy
    physical table (``db_table = "auth_user"``, M2U-A2) so every user FK kept
    targeting the same rows with zero constraint surgery; the cosmetic rename
    to ``accounts_user`` landed in the first post-M3 hygiene batch (migration
    0004, MEMORY.md priority item 2).

    The scope keys (institution/zone/club/state) are M2 relations to the
    domain tables: explicit FKs over implicit code-string contracts (P3),
    keeping the legacy column names (``db_column``) and code-string values
    (``to_field="code"``) so the M1 rows survive the swap (M2-A5). There is
    intentionally NO DB-level constraint on them (``db_constraint=False``):
    M1-era rows carry plain codes and must never break at DDL time;
    ``manage.py verify_domain`` reports the codes no domain row answers for
    (the P5 heal list), and the domain graph wins over the soft key whenever
    both are present (``domain.assignments``, P4).
    """

    category = models.CharField(max_length=32, choices=CATEGORY_CHOICES)
    sub_role = models.CharField(max_length=32, choices=SUB_ROLE_CHOICES)

    # --- Scope keys (M2: real relations; legacy column names kept) --------
    institution = models.ForeignKey(
        "domain.Institution",
        to_field="code",
        on_delete=models.PROTECT,
        db_column="institution_code",
        db_constraint=False,
        blank=True,
        default="",
        related_name="profiles",
    )
    club = models.ForeignKey(
        "domain.Club",
        to_field="code",
        on_delete=models.PROTECT,
        db_column="club_code",
        db_constraint=False,
        blank=True,
        default="",
        related_name="profiles",
    )
    zone = models.ForeignKey(
        "domain.Zone",
        to_field="code",
        on_delete=models.PROTECT,
        db_column="zone_code",
        db_constraint=False,
        blank=True,
        default="",
        related_name="profiles",
    )
    state = models.ForeignKey(
        "domain.State",
        to_field="code",
        on_delete=models.PROTECT,
        db_column="state_code",
        db_constraint=False,
        blank=True,
        default="",
        related_name="profiles",
    )

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

    #: Scoping registry (``core.scoping``): the user record is scoped by the
    #: raw code-string columns (attname lookups — M1 semantics byte-for-byte,
    #: including unbacked codes). The "user" key names THIS table's own row
    #: identity (was ``user_id`` on the dropped ``accounts_profile``).
    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
        "state": "state_id",
        "zone": "zone_id",
        "institution": "institution_id",
        "club": "club_id",
        "user": "id",
    }

    class Meta(AbstractUser.Meta):
        # Post-M3 hygiene (MEMORY.md priority item 2, migration 0004): the
        # cosmetic rename auth_user -> accounts_user. Postgres re-points the
        # user FKs (memberships, assignments, passkeys, OTPs) automatically
        # on RENAME; SQLite rewrites the references too. Legacy index names
        # (auth_user_*) are intentionally left alone — renaming them is
        # schema churn without value (tracked with M2U-A2).
        db_table = "accounts_user"
        # The four scope FKs keep the reverse accessor name "profiles" for
        # the same reason as the table name above: it is a M1-era artifact,
        # unused in code, and renaming it would churn the schema of the
        # auth table for a cosmetic gain. Tracked with M2U-A2.
        # Index names are PINNED explicitly to the frozen M2U-era names: the
        # table rename (0004) must not cascade into index renames, and an
        # explicit name is the single source of truth (P4) vs. Django's
        # table-derived auto-names.
        indexes = [
            models.Index(
                fields=["category", "sub_role"],
                name="auth_user_categor_9de067_idx",
            ),
            models.Index(fields=["institution"], name="auth_user_institu_46392f_idx"),
            models.Index(fields=["club"], name="auth_user_club_co_6bb4a8_idx"),
            models.Index(fields=["zone"], name="auth_user_zone_co_3252d4_idx"),
            models.Index(fields=["state"], name="auth_user_state_c_4b197f_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.username} ({self.sub_role})"

    # --- M1 code-string compat (same names, same semantics) ---------------
    @property
    def institution_code(self) -> str:
        """Code string of the scoped institution (M1-compatible read)."""
        return self.institution_id or ""

    @institution_code.setter
    def institution_code(self, value: str | None) -> None:
        self.institution_id = value or ""

    @property
    def club_code(self) -> str:
        """Code string of the scoped club (M1-compatible read)."""
        return self.club_id or ""

    @club_code.setter
    def club_code(self, value: str | None) -> None:
        self.club_id = value or ""

    @property
    def zone_code(self) -> str:
        """Code string of the scoped zone (M1-compatible read)."""
        return self.zone_id or ""

    @zone_code.setter
    def zone_code(self, value: str | None) -> None:
        self.zone_id = value or ""

    @property
    def state_code(self) -> str:
        """Code string of the scoped state (M1-compatible read)."""
        return self.state_id or ""

    @state_code.setter
    def state_code(self, value: str | None) -> None:
        self.state_id = value or ""


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
