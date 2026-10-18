"""Encryption at rest for TOTP secrets (BRIEF_M1.md §2c).

Construction: SHAKE256 keystream XOR (CTR-style) with an HMAC-SHA256
encrypt-then-MAC tag, keyed from DJANGO_SECRET_KEY via a domain-separated
XOF. This keeps the TOTP secret confidential at rest without adding a
third-party crypto dependency (the dependency pin list is locked), while
still detecting tampering. See docs/SECURITY.md ("TOTP secret at rest").
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from django.conf import settings

_DOMAIN = b"ndli-m1-totp-seal-v1|"


def _key() -> bytes:
    return hashlib.shake_256(
        _DOMAIN + (settings.SECRET_KEY or "").encode()
    ).digest(32)


def _keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    return hashlib.shake_256(key + nonce).digest(length)


def seal(plaintext: str) -> str:
    """Encrypt ``plaintext``; returns a url-safe base64 blob."""
    key = _key()
    nonce = secrets.token_bytes(16)
    data = plaintext.encode()
    stream = _keystream(key, nonce, len(data))
    ciphertext = bytes(a ^ b for a, b in zip(data, stream, strict=True))
    tag = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(nonce + tag + ciphertext).decode()


def unseal(blob: str) -> str:
    """Decrypt a :func:`seal` blob; raises ``ValueError`` on tampering."""
    raw = base64.urlsafe_b64decode(blob.encode())
    if len(raw) < 48:
        raise ValueError("sealed blob too short")
    nonce, tag, ciphertext = raw[:16], raw[16:48], raw[48:]
    key = _key()
    expected = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected):
        raise ValueError("sealed blob failed integrity check")
    stream = _keystream(key, nonce, len(ciphertext))
    return bytes(a ^ b for a, b in zip(ciphertext, stream, strict=True)).decode()
