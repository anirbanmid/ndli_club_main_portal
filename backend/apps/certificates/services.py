"""Verification service (BRIEF_M3 §4a, pins V1–V2).

One entry point: :func:`verify_certificate`. It answers with a typed status
and, only on success, a **disclosure dict** limited to the six public fields
(name, club, institution, event title, date, status). Email, mobile and
APAAR ID are NEVER present — that absence is a named test (V2), not a
comment.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final

from apps.certificates.models import Certificate
from apps.certificates.signing import canonical_payload_for, verify_signature

#: Verification outcomes. "not_found" is deliberately indistinguishable from
#: "invalid" in shape (same disclosure key set) so the endpoint cannot be
#: used to enumerate certificate ids.
STATUS_VALID: Final[str] = "valid"
STATUS_REVOKED: Final[str] = "revoked"
STATUS_INVALID: Final[str] = "invalid"
STATUS_NOT_FOUND: Final[str] = "not_found"

#: The six disclosure fields (V2). P4 single source: the API serialiser
#: builds its response FROM this tuple.
DISCLOSURE_FIELDS: Final[tuple[str, ...]] = (
    "name",
    "club",
    "institution",
    "event_title",
    "date",
    "status",
)


@dataclass(frozen=True)
class VerificationResult:
    """Outcome of a verification request."""

    status: str
    disclosure: dict[str, Any] | None

    @property
    def ok(self) -> bool:
        return self.status == STATUS_VALID


def _disclosure(cert: Certificate, status: str) -> dict[str, Any]:
    """Build the six-field public disclosure for a certificate row."""
    return {
        "name": cert.holder.get_full_name() or cert.holder.username,
        "club": cert.club.name,
        "institution": cert.club.institution.name,
        "event_title": cert.event_title,
        "date": cert.event_date.isoformat(),
        "status": status,
    }


def verify_certificate(certificate_id: str) -> VerificationResult:
    """Verify one certificate id.

    Order of checks (BRIEF_M3 §4a): signature first, then revocation —
    a revoked certificate must never produce a success response, even when
    its signature is intact.
    """
    try:
        cert = Certificate.objects.select_related(
            "holder", "club", "club__institution"
        ).get(certificate_id=certificate_id)
    except Certificate.DoesNotExist:
        return VerificationResult(status=STATUS_NOT_FOUND, disclosure=None)

    if not verify_signature(cert, canonical_payload_for(cert)):
        return VerificationResult(status=STATUS_INVALID, disclosure=None)

    if hasattr(cert, "revocation"):
        return VerificationResult(
            status=STATUS_REVOKED,
            disclosure=_disclosure(cert, STATUS_REVOKED),
        )

    return VerificationResult(
        status=STATUS_VALID, disclosure=_disclosure(cert, STATUS_VALID)
    )
