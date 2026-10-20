"""Certificate identifier generation (BRIEF_M3 §4a, pin V4).

Certificate IDs look like ``NDLI-XXXX-XXXX`` where each ``X`` comes from an
unambiguous alphabet: uppercase letters and digits with ``0/O/1/I`` removed,
so an ID read off a printed certificate can never be mistyped as a different
valid ID.

Generation is collision-safe by construction: randomness is large (32**8
space) and :func:`generate_unique_certificate_id` retries on the unique
constraint instead of assuming the random draw was free.
"""
from __future__ import annotations

import secrets

#: Unambiguous alphabet: 26 letters + 10 digits minus 0/O/1/I (pin V4).
#: Single source (P4) — every format check and every generator uses this.
CERT_ID_ALPHABET: str = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

#: Total ID body length (8 symbols in two groups of four).
CERT_ID_BODY_LENGTH: int = 8

#: The full display pattern, e.g. ``NDLI-7KQ2-9M3X``.
CERT_ID_PATTERN: str = "NDLI-XXXX-XXXX"

#: Characters that are deliberately absent (documented for the V4 pin).
CERT_ID_FORBIDDEN: str = "0O1I"


def format_certificate_id(body: str) -> str:
    """Format an 8-symbol body as ``NDLI-XXXX-XXXX``."""
    if len(body) != CERT_ID_BODY_LENGTH:
        raise ValueError("certificate id body must be 8 symbols")
    if any(ch not in CERT_ID_ALPHABET for ch in body):
        raise ValueError("certificate id body contains a forbidden symbol")
    return f"NDLI-{body[:4]}-{body[4:]}"


def is_valid_certificate_id(cert_id: str) -> bool:
    """True iff ``cert_id`` matches the exact display pattern."""
    if len(cert_id) != len(CERT_ID_PATTERN):
        return False
    if not cert_id.startswith("NDLI-") or cert_id[9] != "-":
        return False
    body = cert_id[5:9] + cert_id[10:14]
    return all(ch in CERT_ID_ALPHABET for ch in body)


def random_certificate_id_body() -> str:
    """Draw one 8-symbol body from the unambiguous alphabet."""
    return "".join(secrets.choice(CERT_ID_ALPHABET) for _ in range(CERT_ID_BODY_LENGTH))


def generate_unique_certificate_id(save_callable) -> str:  # type: ignore[no-untyped-def]
    """Generate a certificate ID that does not yet exist in the database.

    ``save_callable(body)`` must attempt to persist a certificate with the
    given body and raise ``django.db.IntegrityError`` on a duplicate
    ``cert_id``. The retry loop turns the unique constraint into the
    collision backstop (BRIEF_M3 §4a), never a crash.
    """
    from django.db import IntegrityError

    for _ in range(25):  # astronomically generous for a 32**8 space
        body = random_certificate_id_body()
        try:
            save_callable(body)
        except IntegrityError:
            continue
        return format_certificate_id(body)
    raise RuntimeError("certificate id space exhausted")  # pragma: no cover
