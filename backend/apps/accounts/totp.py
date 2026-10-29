"""TOTP (RFC 6238) verification + one-time recovery codes (BRIEF_M1.md §2c).

Replay-window 1: codes are accepted within one time-step either side of
now, and a time-step counter already used is never accepted again
(``User.totp_last_counter``).
"""

from __future__ import annotations

import re
import time

import pyotp

from . import crypto
from .hashing import generate_recovery_code, hash_secret, verify_secret
from .models import TOTPRecoveryCode, User

TOTP_INTERVAL_SECONDS = 30
_CODE_RE = re.compile(r"^\d{6}$")


def new_totp_secret() -> str:
    """Fresh base32 secret for enrollment (displayed ONCE by ops tooling)."""
    return pyotp.random_base32()


def provision_totp(profile: User, secret: str | None = None) -> tuple[str, list[str]]:
    """Enable TOTP on the account; returns (secret, recovery codes) ONCE."""
    secret = secret or new_totp_secret()
    profile.totp_secret_encrypted = crypto.seal(secret)
    profile.totp_enabled = True
    profile.totp_last_counter = None
    profile.save(
        update_fields=[
            "totp_secret_encrypted",
            "totp_enabled",
            "totp_last_counter",
            "updated_at",
        ]
    )
    codes = issue_recovery_codes(profile)
    return secret, codes


def issue_recovery_codes(profile: User) -> list[str]:
    """Replace the one-time recovery code set; returned once, stored hashed."""
    TOTPRecoveryCode.objects.filter(user=profile).delete()
    codes: list[str] = []
    for _ in range(10):
        code = generate_recovery_code()
        codes.append(code)
        TOTPRecoveryCode.objects.create(user=profile, code_hash=hash_secret(code))
    return codes


def verify_totp_code(
    profile: User,
    code: str,
    *,
    now: float | None = None,
) -> bool:
    """Verify a 6-digit RFC 6238 code with replay-window 1.

    Accepts the previous, current and next 30-second step (clock drift of
    ±1 step), but never a step at or below the last accepted counter.
    """
    if not profile.totp_enabled or not profile.totp_secret_encrypted:
        return False
    code = code.strip()
    if not _CODE_RE.fullmatch(code):
        return False
    secret = crypto.unseal(profile.totp_secret_encrypted)
    totp = pyotp.TOTP(secret, interval=TOTP_INTERVAL_SECONDS)
    counter = int((now if now is not None else time.time()) // TOTP_INTERVAL_SECONDS)
    for step in (counter - 1, counter, counter + 1):
        if profile.totp_last_counter is not None and step <= profile.totp_last_counter:
            continue
        expected = totp.at(step * TOTP_INTERVAL_SECONDS)
        if code == expected:
            profile.totp_last_counter = step
            profile.save(update_fields=["totp_last_counter", "updated_at"])
            return True
    return False


def consume_recovery_code(profile: User, code: str) -> bool:
    """Consume a one-time recovery code (each code works exactly once)."""
    normalized = code.strip().upper()
    for candidate in TOTPRecoveryCode.objects.filter(
        user=profile, used_at__isnull=True
    ):
        if verify_secret(normalized, candidate.code_hash):
            from django.utils import timezone

            candidate.used_at = timezone.now()
            candidate.save(update_fields=["used_at"])
            return True
    return False
