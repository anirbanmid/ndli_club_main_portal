"""Data models for the Governance app (M6: Institutional Charter Sanction Gate).

Delivered per ``BRIEF_M6.md`` §1 D2 (2026-10-24): the charter decision state
machine lives in ``services.review_charter``; the anchor row below records
what a sanction materialised, so the D2b step (club materialisation +
registration certificate) is idempotent and auditable.
"""
from __future__ import annotations

from django.db import models


class CharterMaterialisation(models.Model):
    """What one sanctioned charter produced (the D2b anchor row).

    Exactly one row per sanctioned ``CharterApplication`` (OneToOne): its mere
    presence means "materialisation already happened", which makes
    :func:`apps.governance.materialisation.materialise_charter` idempotent
    (P5: bounded, self-consistent — no partial clubs).
    """

    application = models.OneToOneField(
        "onboarding.CharterApplication",
        on_delete=models.CASCADE,
        related_name="materialisation",
    )
    institution = models.ForeignKey(
        "domain.Institution",
        on_delete=models.PROTECT,
        related_name="charter_materialisations",
    )
    club = models.ForeignKey(
        "domain.Club",
        on_delete=models.PROTECT,
        related_name="charter_materialisations",
    )
    certificate = models.ForeignKey(
        "certificates.Certificate",
        on_delete=models.PROTECT,
        related_name="charter_materialisations",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.application_id} -> {self.club_id} ({self.certificate_id})"


class RenewalRecord(models.Model):
    """One club renewal lifecycle row (M6 D5 — both Q1 paths).

    Path A: a club authority opens a REQUESTED row -> EMP issues/rejects.
    Path B: the EMP issues directly (row is born ISSUED). Exactly one open
    request per club (partial unique constraint). The certificate itself is
    always minted by ``certificates.issue`` (P4 single cert path).
    """

    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        ISSUED = "issued", "Issued"
        REJECTED = "rejected", "Rejected"

    club = models.ForeignKey(
        "domain.Club",
        on_delete=models.CASCADE,
        related_name="renewal_records",
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.REQUESTED
    )
    requested_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    request_note = models.CharField(max_length=500, blank=True, default="")
    decided_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=500, blank=True, default="")
    certificate = models.ForeignKey(
        "certificates.Certificate",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["club"],
                condition=models.Q(status="requested"),
                name="one_open_renewal_per_club",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "decided_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"RenewalRecord({self.club_id}: {self.status})"
