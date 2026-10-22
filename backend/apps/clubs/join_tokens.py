"""Signed, expiring club join tokens (BRIEF_M4 §3 D3 / §4c, pins W5).

The dynamic QR encodes a join URL carrying ONE of these tokens: a signed,
expiring, club-bound capability that proves "this link comes from this
club's campus join surface".

ONE signer (P4): **no key material, no HMAC and no environment access lives
here.** Every signature goes through the M3 signer
(:mod:`apps.certificates.signing`) — the same keyring
(``CERT_HMAC_KEYRING`` / ``CERT_HMAC_ACTIVE_KEY_ID``), the same
length-prefixed canonical framing (so a signature can never be replayed over
a re-serialised payload) and the same constant-time verification.

Token format: URL-safe base64 of a small JSON envelope ``{v, kid, club, exp,
nonce, sig}`` where ``sig`` is the HMAC over the canonical payload of
``(club, exp, nonce)``. Verification re-derives the canonical payload from
the envelope fields — the envelope is transport, the payload is truth.
"""
from __future__ import annotations

import base64
import binascii
import datetime as dt
import hmac
import json
import secrets
from dataclasses import dataclass
from typing import Any, Final

from django.utils import timezone

from apps.certificates import signing

#: Payload version tag: bump only with a new join-token scheme.
JOIN_PAYLOAD_VERSION: Final[bytes] = b"NDLI-JOIN-v1"

#: Envelope version.
TOKEN_VERSION: Final[int] = 1


class JoinTokenError(ValueError):
    """A join token is malformed, forged, expired or bound to another club."""

    def __init__(self, message: str, *, code: str) -> None:
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass(frozen=True)
class JoinToken:
    """The verified contents of a join token."""

    club_code: str
    expires_at: dt.datetime
    nonce: str


def canonical_payload(*, club_code: str, expires_at: str, nonce: str) -> bytes:
    """Deterministic serialisation of the three signed fields (M3 framing)."""
    parts = [JOIN_PAYLOAD_VERSION]
    for field in (club_code, expires_at, nonce):
        parts.append(signing.length_prefixed(field.encode("utf-8")))
    return b"".join(parts)


def _iso(moment: dt.datetime) -> str:
    return moment.astimezone(dt.UTC).isoformat(timespec="seconds")


def issue_join_token(
    *, club_code: str, ttl_seconds: int, now: dt.datetime | None = None
) -> tuple[str, dt.datetime]:
    """Mint one signed join token for ``club_code``; returns (token, expiry)."""
    if not club_code:
        raise JoinTokenError("A club code is required.", code="token_invalid")
    moment = now if now is not None else timezone.now()
    # Second precision: the envelope serialises ``exp`` as ISO seconds, so
    # the returned expiry must match the token EXACTLY — never report a
    # microsecond-precision expiry the signed token does not carry.
    expires_at = (moment + dt.timedelta(seconds=ttl_seconds)).replace(
        microsecond=0
    )
    expires_iso = _iso(expires_at)
    nonce = secrets.token_urlsafe(16)
    key_id = signing.active_key_id()
    signature = signing.sign(
        canonical_payload(
            club_code=club_code, expires_at=expires_iso, nonce=nonce
        ),
        key_id=key_id,
    )
    envelope: dict[str, Any] = {
        "v": TOKEN_VERSION,
        "kid": key_id,
        "club": club_code,
        "exp": expires_iso,
        "nonce": nonce,
        "sig": signature,
    }
    raw = json.dumps(envelope, separators=(",", ":"), sort_keys=True).encode("utf-8")
    token = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    return token, expires_at


def _decode(token: str) -> dict[str, Any]:
    padded = token + "=" * (-len(token) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded)
        envelope = json.loads(raw)
    except (binascii.Error, ValueError, json.JSONDecodeError) as exc:
        raise JoinTokenError(
            "That join link is not valid.", code="token_invalid"
        ) from exc
    if not isinstance(envelope, dict):
        raise JoinTokenError("That join link is not valid.", code="token_invalid")
    return envelope


def parse_join_token(token: str, *, now: dt.datetime | None = None) -> JoinToken:
    """Verify + decode a join token; raise :class:`JoinTokenError` on failure.

    Order of checks: structure, then signature (constant-time), then expiry —
    so an expired-but-authentic token is told apart from a forged one without
    ever trusting unsigned data.
    """
    if not token:
        raise JoinTokenError("A join link is required.", code="token_missing")
    envelope = _decode(token)
    if envelope.get("v") != TOKEN_VERSION:
        raise JoinTokenError("That join link is not valid.", code="token_invalid")
    fields = (
        envelope.get("kid"),
        envelope.get("club"),
        envelope.get("exp"),
        envelope.get("nonce"),
        envelope.get("sig"),
    )
    if not all(isinstance(value, str) and value for value in fields):
        raise JoinTokenError("That join link is not valid.", code="token_invalid")
    key_id = str(envelope["kid"])
    club_code = str(envelope["club"])
    expires_iso = str(envelope["exp"])
    nonce = str(envelope["nonce"])
    signature = str(envelope["sig"])
    payload = canonical_payload(
        club_code=club_code, expires_at=expires_iso, nonce=nonce
    )
    try:
        expected = signing.sign(payload, key_id=key_id)
    except signing.CertificateSigningError as exc:
        raise JoinTokenError(
            "That join link is not valid.", code="token_invalid"
        ) from exc
    if not hmac.compare_digest(expected, signature):
        raise JoinTokenError("That join link is not valid.", code="token_invalid")
    try:
        expires_at = dt.datetime.fromisoformat(expires_iso)
    except ValueError as exc:
        raise JoinTokenError(
            "That join link is not valid.", code="token_invalid"
        ) from exc
    if expires_at.tzinfo is None:
        raise JoinTokenError("That join link is not valid.", code="token_invalid")
    moment = now if now is not None else timezone.now()
    if expires_at <= moment:
        raise JoinTokenError("That join link has expired.", code="token_expired")
    return JoinToken(club_code=club_code, expires_at=expires_at, nonce=nonce)
