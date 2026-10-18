"""Password policy: min length 10 + deny common passwords (BRIEF_M1.md §6).

No expiry nagging: a password stays valid until the user changes it (the
``must_change_password`` flag is only set by the F2/F5 one-time displays).
"""
from __future__ import annotations

import re

# NOTE: the DRF ValidationError is raised deliberately, not Django's. Every
# failure path in the identity layer must surface as a 4xx to the API client;
# a bare django.core.exceptions.ValidationError would become a 500.
from rest_framework.exceptions import ValidationError

from . import conf

# Small denylist of the passwords attackers try first; kept in code so the
# policy is offline and deterministic (no network lookups).
COMMON_PASSWORDS = frozenset(
    {
        "password",
        "password1",
        "password123",
        "passw0rd123",
        "1234567890",
        "12345678901",
        "qwertyuiop",
        "letmein123",
        "iloveyou123",
        "admin12345",
        "welcome123",
        "ndli123456",
        "changeme123",
        "football123",
        "dragon12345",
        "monkey12345",
        "sunshine123",
        "princess123",
        "trustno1234",
        "superman123",
    }
)


def validate_password_strength(password: str) -> None:
    """Raise ``ValidationError`` when the password violates the policy."""
    if len(password) < conf.PASSWORD_MIN_LENGTH:
        raise ValidationError(
            f"Password must be at least {conf.PASSWORD_MIN_LENGTH} characters long.",
            code="password_too_short",
        )
    if password.lower() in COMMON_PASSWORDS:
        raise ValidationError(
            "This password is too common. Choose a different one.",
            code="password_too_common",
        )
    if re.fullmatch(r"(.)\1*", password):
        raise ValidationError(
            "Password must not be a single repeated character.",
            code="password_too_simple",
        )
