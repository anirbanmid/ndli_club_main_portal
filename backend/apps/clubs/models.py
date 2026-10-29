"""Showcase + campus passkey models (BRIEF_M4 §3 D3).

* ``ClubShowcase`` — the public showcase of ONE club: derived unique
  ``slug`` (blocklist-enforced at write, ``apps.clubs.slugs``) plus the
  public-safe identity fields. NO student PII lives on this table (P0,
  M4-A2): roster figures are COUNTS computed from ``domain.Membership``.
* ``ShowcaseSection`` — one ordered showcase section (heading + body).
* ``CampusPasskey`` — the STUDENT campus self-join passkey (D3/§4c): a short
  human-typable club code, stored ONLY as a keyed hash, TTL-bound,
  single-active per club (``OneToOneField``), rotatable and revocable.
  NOT to be confused with ``accounts.ClubPasskey`` — that one is the F5
  Official Institutional Passkey for the break-glass handover.

Scoping (``core.scoping``): every row answers for its club through the same
``Membership``-style scope keys, so the M1 policy layer scopes these tables
without any per-view logic (I5).
"""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.db import models

from apps.domain.models import Club

from . import slugs


class ClubShowcase(models.Model):
    """The public page of one club at ``/clubs/<slug>/`` (read-only for all)."""

    club = models.OneToOneField(
        Club,
        on_delete=models.CASCADE,
        related_name="showcase",
    )
    #: Derived at create (institution + club names), collision-safe and
    #: blocklist-checked. Immutable afterwards: the URL is public identity.
    slug = models.SlugField(max_length=160, unique=True)
    tagline = models.CharField(max_length=240, blank=True, default="")
    about = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    #: Scoping registry (core.scoping): mirrors ``domain.Membership``.
    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
        "state": "club__institution__state__code",
        "zone": "club__institution__state__zone__code",
        "institution": "club__institution__code",
        "club": "club__code",
    }

    class Meta:
        ordering = ["slug"]
        indexes = [
            models.Index(fields=["club"], name="clubshowcase_club_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"ClubShowcase({self.slug})"

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Persist with the reserved-words blocklist enforced at EVERY write.

        W4: the check lives on the model, so no write path (service, admin,
        shell) can ever publish a blocked slug — not only the happy one.
        """
        self.slug = slugs.validate_slug(self.slug)
        super().save(*args, **kwargs)


class ShowcaseSection(models.Model):
    """One ordered section of a club showcase (heading + body, admin-authored)."""

    showcase = models.ForeignKey(
        ClubShowcase,
        on_delete=models.CASCADE,
        related_name="sections",
    )
    heading = models.CharField(max_length=120)
    body = models.TextField()
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"ShowcaseSection({self.showcase_id}: {self.heading})"


class CampusPasskey(models.Model):
    """The club-scoped student self-join passkey (BRIEF_M4 §4c).

    Exactly one row per club (``OneToOneField`` = one-active-per-club by
    construction). The plaintext code is shown ONCE at issue/regenerate and
    only its keyed hash is stored (P0). Regenerating replaces the hash, so
    the previous code can never verify again ("regenerate invalidates old",
    W5). Revoke is the bounded repair for a leaked code (P5) — audited.
    """

    club = models.OneToOneField(
        Club,
        on_delete=models.CASCADE,
        related_name="campus_passkey",
    )
    #: Deterministic keyed hash (accounts.hashing) — indexed because the
    #: public join door resolves a typed code by hash equality (P1).
    code_hash = models.CharField(max_length=128, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="campus_passkeys_issued",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    rotated_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)

    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
        "state": "club__institution__state__code",
        "zone": "club__institution__state__zone__code",
        "institution": "club__institution__code",
        "club": "club__code",
    }

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"CampusPasskey({self.club_id})"

    @property
    def status_payload(self) -> dict[str, Any]:
        """Admin-facing status WITHOUT any secret material (P0)."""
        return {
            "is_active": self.is_active,
            "created_at": self.created_at,
            "rotated_at": self.rotated_at,
            "revoked_at": self.revoked_at,
            "expires_at": self.expires_at,
        }
