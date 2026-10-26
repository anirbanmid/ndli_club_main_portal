"""Argon2id password hashing (BRIEF_M1.md §6).

Django's stock Argon2 hasher is used as the library loader, but the type is
pinned explicitly to Argon2id (``argon2.Type.ID``) here so the requirement
holds regardless of Django defaults.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.contrib.auth.hashers import BasePasswordHasher, PBKDF2PasswordHasher

if TYPE_CHECKING:
    from django.utils.functional import _StrPromise


class Argon2idPasswordHasher(BasePasswordHasher):
    """Argon2id (RFC 9106 third variant) password hasher."""

    algorithm = "argon2id"
    library = "argon2"

    time_cost = 2
    memory_cost = 102400  # KiB
    parallelism = 8
    hash_len = 32
    salt_len = 16

    def encode(self, password: str, salt: str) -> str:
        argon2 = self._load_library()  # type: ignore[attr-defined]
        hash_bytes = argon2.low_level.hash_secret(
            password.encode(),
            salt.encode(),
            time_cost=self.time_cost,
            memory_cost=self.memory_cost,
            parallelism=self.parallelism,
            hash_len=self.hash_len,
            type=argon2.low_level.Type.ID,
        )
        # ``hash_bytes`` already starts with "$", so concatenate directly —
        # the same shape Django's own Argon2PasswordHasher produces.
        return self.algorithm + hash_bytes.decode("ascii")

    def _argon2_hash(self, encoded: str) -> str:
        """The bare ``$argon2id$…`` string inside our ``encoded`` value."""
        _algorithm, rest = encoded.split("$", 1)
        return "$" + rest

    def decode(self, encoded: str) -> dict[str, Any]:
        algorithm, _rest = encoded.split("$", 1)
        return {
            "algorithm": algorithm,
            "hash": self._argon2_hash(encoded),
            "time_cost": self.time_cost,
            "memory_cost": self.memory_cost,
            "parallelism": self.parallelism,
        }

    def verify(self, password: str, encoded: str) -> bool:
        argon2 = self._load_library()  # type: ignore[attr-defined]
        try:
            # The HIGH-LEVEL verifier is used deliberately. With
            # argon2-cffi 25.x + cffi 2.x, low_level.verify_secret() fails to
            # decode its own hash_secret() output ("Decoding failed"), which
            # makes every password check return False. Django's own
            # Argon2PasswordHasher uses this API for the same reason.
            # NB: argon2.PasswordHasher.verify takes (hash, password).
            return bool(
                argon2.PasswordHasher().verify(
                    self._argon2_hash(encoded), password
                )
            )
        except (argon2.exceptions.VerificationError, argon2.exceptions.InvalidHash):
            return False
        except (ValueError, UnicodeEncodeError):
            return False

    def safe_summary(self, encoded: str) -> dict[str | _StrPromise, Any]:
        decoded = self.decode(encoded)
        return {
            "algorithm": decoded["algorithm"],
            "iterations": decoded["time_cost"],
            "memory": decoded["memory_cost"],
            "parallelism": decoded["parallelism"],
        }

    def must_update(self, encoded: str) -> bool:
        # Client password standard (owner 2026-10-27): stored passwords
        # migrate to PBKDF2-HMAC-SHA256/100k (the new primary hasher) on the
        # next successful login.
        return True


class PBKDF2ClientHasher(PBKDF2PasswordHasher):
    """PBKDF2-HMAC-SHA256 password hasher — the CLIENT password standard.

    Owner 2026-10-27 (previous-project parity): "Passwords encrypted using
    PBKDF2-HMAC-SHA256 with 100,000 rounds and 16-byte random salts."

    * 100,000 rounds pinned in code (``iterations``).
    * 16-byte random salts: ``salt_entropy = 128`` bits exactly — Django's
      ``BasePasswordHasher.salt()`` maps that to a CSPRNG salt.
    * Wire format is the stock ``pbkdf2_sha256$<rounds>$<salt>$<b64 digest>``
      so standard tooling can verify the stored shape.

    First in ``PASSWORD_HASHERS`` = the default for ``set_password`` and the
    automatic re-hash target for older hashes (Argon2id, higher-iteration
    PBKDF2) whenever those verify successfully (``must_update``).

    NB: this SUPERSEDES the M1 "no new hashing (U4)" pin for stored password
    hashes — the owner's 2026-10-27 client standard is authoritative. The
    M1 keyed-hash primitives (link tokens, OTP codes — apps/accounts/hashing.py)
    are untouched.
    """

    iterations = 100_000
    salt_entropy = 128  # exactly 16 random bytes (client standard)

    def harden_runtime(self, password: str, encoded: str) -> None:  # noqa: ARG002
        """Argon2 is memory-hard; nothing extra to do (interface hook)."""
        return None
