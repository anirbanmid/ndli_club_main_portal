"""Certificate data models (milestone M3, BRIEF_M3 §4a).

Two models:

* ``Certificate`` — an issued, signed certificate record. The HMAC tag and
  its ``key_id`` live ON the row (they are public artefacts); the signing
  KEY never does (V3 — see :mod:`apps.certificates.signing`).
* ``Revocation`` — the revocation list. A revocation is consulted BEFORE any
  success response (BRIEF_M3 §4a); one row per revoked certificate.

Snapshot discipline (documented assumption M3-A8): ``event_title`` and
``event_date`` are snapshotted at issuance. A certificate is a point-in-time
document — renaming an event later must not rewrite history on a printed
certificate. ``event_ref`` is the stable event identifier that the M4+
activities domain will point at; ``holder``/``club`` stay relational (P4:
institution is ALWAYS derived via ``club.institution``, never stored here).
"""

from __future__ import annotations

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

from apps.certificates.ids import CERT_ID_PATTERN, is_valid_certificate_id

#: Display width of a certificate id (single source: the pattern itself).
CERT_ID_MAX_LENGTH = len(CERT_ID_PATTERN)

#: Single source for the display pattern (P4 — the validator reuses the
#: generator's own format law).
certificate_id_validator = RegexValidator(
    regex=r"^NDLI-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$",
    message=f"certificate id must look like {CERT_ID_PATTERN} (no 0/O/1/I)",
)


class CertificateCategory(models.TextChoices):
    """Award categories — mirrors the previous project's CertificateData."""

    PARTICIPATION = "Participation", "Participation"
    MERIT = "Merit", "Merit"
    CLUB_REGISTRATION = "Club Registration", "Club Registration"
    RENEWAL = "Renewal", "Renewal"


class Certificate(models.Model):
    """One issued certificate, verifiable by its public identifier."""

    certificate_id = models.CharField(
        max_length=len(CERT_ID_PATTERN),
        unique=True,
        validators=[certificate_id_validator],
        help_text="Public identifier, e.g. NDLI-7KQ2-9M3X.",
    )
    #: Which key signed this record (rotation-safe history).
    hmac_key_id = models.CharField(max_length=64)
    #: Hex HMAC-SHA256 over the canonical payload — a public artefact.
    hmac_tag = models.CharField(max_length=64, editable=False)

    holder = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="certificates",
    )
    club = models.ForeignKey(
        "domain.Club",
        on_delete=models.PROTECT,
        related_name="certificates",
    )

    #: Stable event identifier (the M4+ activities domain points here).
    event_ref = models.CharField(max_length=64)
    #: Issuance-time snapshot (M3-A8): printed certificates never change.
    event_title = models.CharField(max_length=200)
    event_date = models.DateField()

    category = models.CharField(
        max_length=32,
        choices=CertificateCategory.choices,
        default=CertificateCategory.PARTICIPATION,
    )
    issue_date = models.DateField()

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-issue_date", "certificate_id"]
        indexes = [
            models.Index(fields=["event_ref"]),
            models.Index(fields=["issue_date"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.certificate_id} ({self.category})"


class Revocation(models.Model):
    """Revocation-list row. Presence = the certificate no longer verifies."""

    certificate = models.OneToOneField(
        Certificate,
        on_delete=models.CASCADE,
        related_name="revocation",
    )
    reason = models.CharField(max_length=200)
    revoked_at = models.DateTimeField(default=timezone.now)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="revoked_certificates",
    )

    class Meta:
        ordering = ["-revoked_at"]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"REVOKED {self.certificate.certificate_id}"


def certificate_id_is_valid(cert_id: str) -> bool:
    """Re-export (P4): one format law, one import path for callers/tests."""
    return is_valid_certificate_id(cert_id)
