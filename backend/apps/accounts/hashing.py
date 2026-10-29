"""Secret handling helpers: hashing and single-use token generation.

Rules enforced here (BRIEF_M1.md §6):

* OTP codes, link tokens and Official Institutional Passkeys are only ever
  stored as keyed hashes (HMAC-SHA256 with DJANGO_SECRET_KEY) — never in
  plaintext.
* Link tokens are 32 random bytes (secrets.token_urlsafe(32)).
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

from django.conf import settings


def hash_secret(value: str) -> str:
    """Keyed hash (HMAC-SHA256) of a secret value; store ONLY this."""
    key = (settings.SECRET_KEY or "").encode()
    return hmac.new(key, value.encode(), hashlib.sha256).hexdigest()


def verify_secret(value: str, stored_hash: str) -> bool:
    """Constant-time comparison of a candidate secret against its hash."""
    return hmac.compare_digest(hash_secret(value), stored_hash)


def generate_link_token() -> str:
    """Random 32-byte token for single-use email links (F2/F4)."""
    return secrets.token_urlsafe(32)


def generate_otp_code() -> str:
    """6-digit email OTP code (BRIEF_M1.md §2a)."""
    return f"{secrets.randbelow(1_000_000):06d}"


def generate_password() -> str:
    """Strong random password for one-time displays (F5 break-glass)."""
    return secrets.token_urlsafe(12)


def generate_passkey() -> str:
    """Official Institutional Passkey value (shown once at issuance)."""
    return secrets.token_urlsafe(24)


#: Unambiguous alphabet for short campus codes (no I/O/0/1 to misread).
CAMPUS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_campus_code(prefix: str) -> str:
    """Short human-typable campus passkey code (M4 D3, e.g. ``KGP-7F2Q``).

    A readable club-code prefix plus 4 random characters from
    ``CAMPUS_CODE_ALPHABET``. Shown ONCE at issuance — only its keyed hash
    is ever stored (same rule as every secret in this module).
    """
    clean_prefix = "".join(ch for ch in prefix.upper() if ch.isalnum())[:8]
    body = "".join(secrets.choice(CAMPUS_CODE_ALPHABET) for _ in range(4))
    return f"{clean_prefix}-{body}" if clean_prefix else body


def generate_recovery_code() -> str:
    """One-time TOTP recovery code."""
    return secrets.token_hex(4).upper()
