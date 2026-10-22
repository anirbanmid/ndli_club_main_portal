"""HMAC signing service (BRIEF_M3 §4a, pins V1–V3; THE signer since M4 D3).

Since M4 D3 this is the ONE signer of the product (P4): the club join tokens
(``apps.clubs.join_tokens``) reuse this keyring and the same length-prefixed
canonical framing — no second HMAC/key path exists anywhere.

Design law:

* **Key material never touches the database** (V3). The keyring lives in the
  environment (``CERT_HMAC_KEYRING`` / ``CERT_HMAC_ACTIVE_KEY_ID``), parsed
  here and nowhere else (P4 single source).
* **Rotation does not invalidate history**: every certificate stores the
  ``key_id`` it was signed with; verification uses that key.
* **Verification is constant-time**: :func:`verify_signature` compares with
  :func:`hmac.compare_digest` — never ``==`` (V1 source-pinned).
* **Canonical payload** is serialised deterministically (version tag +
  length-prefixed UTF-8 fields), so a signature can never be replayed over a
  reinterpreted payload (no delimiter injection).
"""
from __future__ import annotations

import base64
import binascii
import hmac
import json
import os
from hashlib import sha256
from typing import TYPE_CHECKING, Final

if TYPE_CHECKING:  # pragma: no cover - typing only
    from apps.certificates.models import Certificate

#: Payload version tag: bump only with a new signing scheme.
CANONICAL_PAYLOAD_VERSION: Final[bytes] = b"NDLI-CERT-v1"

#: Environment names (key material lives ONLY here, V3).
ENV_KEYRING: Final[str] = "CERT_HMAC_KEYRING"
ENV_ACTIVE_KEY_ID: Final[str] = "CERT_HMAC_ACTIVE_KEY_ID"

_MIN_KEY_BYTES: Final[int] = 32


class CertificateSigningError(RuntimeError):
    """Raised when the keyring is missing, malformed, or too weak."""


def _load_keyring() -> dict[str, bytes]:
    """Parse ``CERT_HMAC_KEYRING`` (JSON ``{"key_id": "<base64 key>"}``)."""
    raw = os.environ.get(ENV_KEYRING, "")
    if not raw:
        raise CertificateSigningError(f"{ENV_KEYRING} is not configured")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise CertificateSigningError(f"{ENV_KEYRING} is not valid JSON") from exc
    if not isinstance(parsed, dict) or not parsed:
        raise CertificateSigningError(f"{ENV_KEYRING} must be a non-empty object")
    keyring: dict[str, bytes] = {}
    for key_id, encoded in parsed.items():
        if not isinstance(key_id, str) or not isinstance(encoded, str):
            raise CertificateSigningError(f"{ENV_KEYRING} entries must be strings")
        try:
            key = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise CertificateSigningError(
                f"{ENV_KEYRING}[{key_id}] is not base64"
            ) from exc
        if len(key) < _MIN_KEY_BYTES:
            raise CertificateSigningError(
                f"{ENV_KEYRING}[{key_id}] is shorter than 32 bytes"
            )
        keyring[key_id] = key
    return keyring


def active_key_id() -> str:
    """Return the key id used for NEW signatures."""
    key_id = os.environ.get(ENV_ACTIVE_KEY_ID, "")
    if not key_id:
        raise CertificateSigningError(f"{ENV_ACTIVE_KEY_ID} is not configured")
    if key_id not in _load_keyring():
        raise CertificateSigningError(
            f"{ENV_ACTIVE_KEY_ID}={key_id} is not in the keyring"
        )
    return key_id


def _key_for(key_id: str) -> bytes:
    keyring = _load_keyring()
    try:
        return keyring[key_id]
    except KeyError as exc:  # unknown key id => signature cannot verify
        raise CertificateSigningError(f"unknown HMAC key id: {key_id}") from exc


def length_prefixed(value: bytes) -> bytes:
    """4-byte big-endian length prefix + value (the M3 canonical framing).

    Public since M4 D3: the club join-token payload (``apps.clubs.join_tokens``)
    reuses THIS framing so one signer = one canonical encoding (P4).
    """
    return len(value).to_bytes(4, "big") + value


def canonical_payload(
    *,
    certificate_id: str,
    holder_id: int,
    club_id: int,
    event_ref: str,
    issue_date: str,
) -> bytes:
    """Deterministic serialisation of the five signed fields.

    ``issue_date`` must be ISO ``YYYY-MM-DD``. Length-prefixing makes the
    encoding injective: no two different field tuples can serialise to the
    same bytes.
    """
    parts = [CANONICAL_PAYLOAD_VERSION]
    for field in (certificate_id, str(holder_id), str(club_id), event_ref, issue_date):
        parts.append(length_prefixed(field.encode("utf-8")))
    return b"".join(parts)


def canonical_payload_for(cert: Certificate) -> bytes:
    """Canonical payload for a stored certificate row (P4: one definition)."""
    return canonical_payload(
        certificate_id=cert.certificate_id,
        holder_id=cert.holder_id,
        club_id=cert.club_id,
        event_ref=cert.event_ref,
        issue_date=cert.issue_date.isoformat(),
    )


def sign(payload: bytes, *, key_id: str) -> str:
    """HMAC-SHA256 of ``payload`` under ``key_id``; returns lowercase hex."""
    key = _key_for(key_id)
    return hmac.new(key, payload, sha256).hexdigest()


def sign_certificate(cert: Certificate) -> str:
    """Compute the signature for a certificate row under the active key."""
    return sign(canonical_payload_for(cert), key_id=active_key_id())


def verify_signature(cert: Certificate, payload: bytes) -> bool:
    """Constant-time verification of a certificate's stored signature."""
    try:
        expected = sign(payload, key_id=cert.hmac_key_id)
    except CertificateSigningError:
        return False
    return hmac.compare_digest(expected, cert.hmac_tag)
