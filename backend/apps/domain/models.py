"""Core domain models (milestone M2, BRIEF_M2.md §2a).

The eight models below are the single source of truth for the regional
governance structure of the portal. Everything is DATA (seed files under
``data/samples/`` + admin-editable): no zone, state or officer mapping is
hard-coded anywhere in Python (BRIEF_M2.md §1).

* ``Zone``           — the 6 regional zones (North, Central, West, East,
                       North East, South; South carries two officers).
* ``State``          — the 36 States/UTs, each pointing at exactly one zone.
* ``District``       — sample district master, scoped to a state.
* ``Institution``    — the AISHE-anchored institution directory. ``code`` is
                       the stable public identifier, ``legacy_id`` is the
                       immutable anchor and ``aishe_code`` is SOFT
                       verification: institutions without AISHE are never
                       blocked (BRIEF_M2.md §5.1).
* ``Club``           — one or more clubs per institution (M2-A2).
* ``Membership``     — relational user ↔ club membership (no free text).
* ``AuthorityAssignment`` — the 4 club authority tiers with date windows.
* ``OfficerAssignment``   — the State/UT ↔ officer table that backs
                       ``accounts.routing.responsible_officer`` (P4).

P4 (single source): the zone of an institution/club is ALWAYS derived from
``institution.state.zone`` — it is never stored in parallel (M2-A1).
"""

from __future__ import annotations

from datetime import date
from typing import Any, ClassVar

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

#: Single source (P4) for every domain code column width. Sized for the real
#: masters (the widest State/UT code is 40 chars) and matching the M1 identity
#: code columns (varchar(64)) so a soft code can never overflow a domain code.
CODE_MAX_LENGTH = 64


class Zone(models.Model):
    """One regional zone of the portal (6 rows in the sample seed)."""

    code = models.CharField(max_length=CODE_MAX_LENGTH, unique=True)
    name = models.CharField(max_length=64)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    #: Scoping registry (core.scoping): "rows belonging to zone X" = own code.
    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {"zone": "code"}

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.code} ({self.name})"


class State(models.Model):
    """One State or Union Territory (36 rows in the sample seed)."""

    class Kind(models.TextChoices):
        STATE = "state", "State"
        UT = "ut", "Union Territory"

    code = models.CharField(max_length=CODE_MAX_LENGTH, unique=True)
    name = models.CharField(max_length=64)
    zone = models.ForeignKey(
        Zone,
        on_delete=models.PROTECT,
        related_name="states",
    )
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.STATE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {"state": "code", "zone": "zone__code"}

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.code} ({self.name})"


class District(models.Model):
    """One district of a state (sample rows only; official master to come)."""

    state = models.ForeignKey(
        State,
        on_delete=models.CASCADE,
        related_name="districts",
    )
    code = models.CharField(max_length=CODE_MAX_LENGTH)
    name = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    #: Only the zone scope applies to a district; missing keys fail closed.
    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
        "state": "state__code",
        "zone": "state__zone__code",
    }

    class Meta:
        ordering = ["state", "code"]
        constraints = [
            models.UniqueConstraint(
                fields=["state", "code"], name="district_state_code_uniq"
            ),
        ]
        indexes = [
            models.Index(fields=["state", "name"], name="district_state_name_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.code} ({self.name})"


class Institution(models.Model):
    """One educational institution in the directory.

    ``code`` is the stable public identifier used by every relation in the
    portal; ``legacy_id`` is the immutable anchor that preserves history
    across renames/merges; ``aishe_code`` is nullable on purpose — AISHE-less
    legacy institutions are always usable (soft verification) and linking an
    AISHE code later is an audited action (``domain.services.link_aishe``).
    The zone is DERIVED from the state (P4), never stored here.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PENDING = "pending", "Pending verification"
        CLOSED = "closed", "Closed"

    code = models.CharField(max_length=CODE_MAX_LENGTH, unique=True)
    legacy_id = models.CharField(max_length=64, unique=True, editable=False)
    aishe_code = models.CharField(max_length=32, unique=True, null=True, blank=True)
    name = models.CharField(max_length=255)
    state = models.ForeignKey(
        State,
        on_delete=models.PROTECT,
        related_name="institutions",
    )
    district = models.ForeignKey(
        District,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="institutions",
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
        "state": "state__code",
        "zone": "state__zone__code",
        "institution": "code",
    }

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(
                fields=["state", "district", "name"],
                name="institution_directory_idx",
            ),
        ]

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._original_legacy_id: str = self.legacy_id

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.code} ({self.name})"

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Persist the row, refusing to rewrite the immutable ``legacy_id``."""
        if self.pk is not None and self.legacy_id != self._original_legacy_id:
            raise ValidationError(
                {"legacy_id": "legacy_id is immutable once set (M2 anchor)."}
            )
        super().save(*args, **kwargs)
        self._original_legacy_id = self.legacy_id

    @property
    def zone(self) -> Zone:
        """Derived zone (P4 single source: state -> zone, never duplicated)."""
        return self.state.zone

    @property
    def aishe_verified(self) -> bool:
        """Soft verification flag: an AISHE code is linked (never blocking)."""
        return bool(self.aishe_code)


class Club(models.Model):
    """One club inside an institution (M2-A2: several clubs per institution)."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        DORMANT = "dormant", "Dormant"
        CLOSED = "closed", "Closed"

    code = models.CharField(max_length=CODE_MAX_LENGTH, unique=True)
    institution = models.ForeignKey(
        Institution,
        on_delete=models.PROTECT,
        related_name="clubs",
    )
    name = models.CharField(max_length=255)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    registration_no = models.CharField(max_length=64, blank=True, default="")
    date_of_approval = models.DateField(null=True, blank=True)
    last_renewal_date = models.DateField(null=True, blank=True)
    upcoming_renewal_date = models.DateField(null=True, blank=True)
    member_count = models.PositiveIntegerField(default=1000)
    solo_activities = models.PositiveIntegerField(default=0)
    joint_activities = models.PositiveIntegerField(default=0)
    patron_name = models.CharField(max_length=128, blank=True, default="")
    patron_email = models.EmailField(blank=True, default="")
    patron_phone = models.CharField(max_length=32, blank=True, default="")
    president_name = models.CharField(max_length=128, blank=True, default="")
    president_email = models.EmailField(blank=True, default="")
    president_phone = models.CharField(max_length=32, blank=True, default="")
    secretary_name = models.CharField(max_length=128, blank=True, default="")
    secretary_email = models.EmailField(blank=True, default="")
    secretary_phone = models.CharField(max_length=32, blank=True, default="")
    is_sample = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
        "state": "institution__state__code",
        "zone": "institution__state__zone__code",
        "institution": "institution__code",
        "club": "code",
    }

    class Meta:
        ordering = ["code"]
        indexes = [
            models.Index(fields=["institution"], name="club_institution_idx"),
            models.Index(fields=["is_sample"], name="club_is_sample_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.code} ({self.name})"

    @property
    def zone(self) -> Zone:
        """Derived zone (P4: club -> institution -> state -> zone)."""
        return self.institution.state.zone


class Membership(models.Model):
    """Relational membership: exactly one row per (user, club) pair.

    Membership is never free text anywhere (BRIEF_M2.md §2a rules): joining
    means creating this row inside one transaction.
    """

    class Role(models.TextChoices):
        MEMBER = "member", "Member"
        VOLUNTEER = "volunteer", "Volunteer"
        CORE_TEAM = "core_team", "Core team"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ALUMNI = "alumni", "Alumni"
        SUSPENDED = "suspended", "Suspended"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    club = models.ForeignKey(
        Club,
        on_delete=models.PROTECT,
        related_name="memberships",
    )
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.MEMBER)
    joined_on = models.DateField(default=date.today)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
        "state": "club__institution__state__code",
        "zone": "club__institution__state__zone__code",
        "institution": "club__institution__code",
        "club": "club__code",
        "user": "user",
    }

    class Meta:
        ordering = ["club", "joined_on"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "club"], name="membership_user_club_uniq"
            ),
        ]
        indexes = [
            models.Index(fields=["club", "status"], name="membership_club_status_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.user_id}@{self.club_id} ({self.status})"


class AuthorityAssignment(models.Model):
    """One club-authority appointment (the 4 spec tiers) with a date window.

    M2 models the assignment DATA only — the succession workflows (Dual-Factor
    Succession Desk, Transition Seal) are later milestones (M2-A3).
    """

    class Tier(models.TextChoices):
        PATRON = "patron", "Patron"
        PRESIDENT = "president", "President"
        SECRETARY = "secretary", "Secretary"
        EXECUTIVE = "executive", "Executive"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ENDED = "ended", "Ended"
        REVOKED = "revoked", "Revoked"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="authority_assignments",
    )
    club = models.ForeignKey(
        Club,
        on_delete=models.PROTECT,
        related_name="authority_assignments",
    )
    tier = models.CharField(max_length=16, choices=Tier.choices)
    from_date = models.DateField()
    to_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
        "state": "club__institution__state__code",
        "zone": "club__institution__state__zone__code",
        "institution": "club__institution__code",
        "club": "club__code",
        "user": "user",
    }

    class Meta:
        ordering = ["club", "tier", "-from_date"]
        indexes = [
            models.Index(
                fields=["club", "tier", "from_date"],
                name="authority_club_tier_from_idx",
            ),
            models.Index(fields=["user"], name="authority_user_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.user_id}@{self.club_id} {self.tier} ({self.status})"


class OfficerAssignment(models.Model):
    """The State/UT ↔ officer table (BRIEF_M2.md §2a).

    This table is the ONE source behind ``routing.responsible_officer``
    (P4): approval routing reads it and nothing else. ``to_date`` empty means
    the assignment is open-ended; overlapping windows are reported by
    ``manage.py verify_domain`` (never silently guessed).
    """

    state = models.ForeignKey(
        State,
        on_delete=models.PROTECT,
        related_name="officer_assignments",
    )
    officer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="officer_assignments",
    )
    from_date = models.DateField()
    to_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
        "state": "state__code",
        "zone": "state__zone__code",
        "user": "officer",
    }

    class Meta:
        ordering = ["state", "-from_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["state", "officer", "from_date"],
                name="officer_state_officer_from_uniq",
            ),
        ]
        indexes = [
            models.Index(fields=["state", "from_date"], name="officer_state_from_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.state_id}->{self.officer_id} from {self.from_date}"
