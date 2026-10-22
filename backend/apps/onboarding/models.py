"""Onboarding data models (BRIEF_M4 §3 D2 — 4-Authority onboarding wizard).

One ``OnboardingDraft`` per club attempt holds the whole wizard state so a
crash mid-wizard loses nothing (P5: resume is the bounded self-repair).
Four ``OnboardingAuthority`` slots (Patron/President/Secretary/Executive) are
OTP-validated before their step completes (W1). ``OnboardingUpload`` stores
METADATA only — document bytes live in hash-addressed private storage, never
served inline (W3, P0). Submission writes ONE ``CharterApplication``
(status=queued) for the M6 governance review; M4 stops at enqueue.

Owner decisions 2026-10-21 (BRIEF_M4 §8): passkey code+QR · showcase Option B
(public index; dashboard = credentialed admins only — W9) · bulk import
sync-chunked · **authority uploads = ONE combined document (jpeg/pdf)**.
"""
from __future__ import annotations

import uuid

from django.db import models


class AuthorityRole(models.TextChoices):
    """The four authorities that register a club (BUILD_PROMPT_v2 §M4)."""

    PATRON = "patron", "Patron"
    PRESIDENT = "president", "President"
    SECRETARY = "secretary", "Secretary"
    EXECUTIVE = "executive", "Executive"


class OnboardingDraft(models.Model):
    """Server-side wizard state; token-based resume with explicit expiry."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        EXPIRED = "expired", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Institution/club identity snapshot (the domain Club row is created by
    # the M6 review, not here — this is the REQUEST, not the record).
    institution_name = models.CharField(max_length=200)
    aishe_code = models.CharField(max_length=64, blank=True, default="")
    club_name = models.CharField(max_length=200)
    zone_code = models.CharField(max_length=32)
    state_code = models.CharField(max_length=32)
    district_code = models.CharField(max_length=32)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT
    )
    # Resume token: only the SHA-256 is stored (P0 — never the raw token).
    resume_token_hash = models.CharField(max_length=64, unique=True)
    resume_token_expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            # One application per club (BRIEF_M4: duplicates blocked).
            models.UniqueConstraint(
                fields=["institution_name", "club_name"],
                condition=models.Q(status="draft"),
                name="one_active_draft_per_club",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin/debug convenience
        return f"OnboardingDraft({self.club_name} @ {self.institution_name})"


class OnboardingAuthority(models.Model):
    """One authority slot; step completes only after an OTP pass (W1)."""

    draft = models.ForeignKey(
        OnboardingDraft, on_delete=models.CASCADE, related_name="authorities"
    )
    role = models.CharField(max_length=16, choices=AuthorityRole.choices)
    full_name = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=32)
    designation = models.CharField(max_length=200, blank=True, default="")
    otp_verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["draft", "role"], name="one_authority_per_role_per_draft"
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"OnboardingAuthority({self.role}: {self.full_name})"


class OnboardingUpload(models.Model):
    """Metadata of the ONE combined document (jpeg/pdf) for the draft.

    Bytes live in private hash-addressed storage (services layer); the
    stored name is the content SHA-256, never the user filename (W3).
    """

    draft = models.OneToOneField(
        OnboardingDraft, on_delete=models.CASCADE, related_name="upload"
    )
    original_name = models.CharField(max_length=255)
    stored_name = models.CharField(max_length=64)  # sha256 hex of content
    content_sha256 = models.CharField(max_length=64)
    mime_type = models.CharField(max_length=100)
    size_bytes = models.PositiveIntegerField()
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:  # pragma: no cover
        return f"OnboardingUpload({self.stored_name[:12]}…)"


class CharterApplication(models.Model):
    """The charter-queue row (status=queued) consumed by M6 governance."""

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    draft = models.OneToOneField(
        OnboardingDraft, on_delete=models.PROTECT, related_name="application"
    )
    institution_name = models.CharField(max_length=200)
    club_name = models.CharField(max_length=200)
    zone_code = models.CharField(max_length=32)
    state_code = models.CharField(max_length=32)
    district_code = models.CharField(max_length=32)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.QUEUED
    )
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["institution_name", "club_name"],
                name="one_application_per_club",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"CharterApplication({self.club_name}: {self.status})"
