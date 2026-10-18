"""M1 configuration knobs (env-overridable, documented in docs/SECURITY.md).

All values are read from Django settings so tests can override them with
``override_settings`` without touching the environment.
"""
from __future__ import annotations

from django.conf import settings


def _int(name: str, default: int) -> int:
    return int(getattr(settings, name, default))


# --- Email OTP (BRIEF_M1.md §2a) ------------------------------------------
OTP_LENGTH = 6
OTP_TTL_SECONDS = _int("M1_OTP_TTL_SECONDS", 600)  # 10 minutes
OTP_MAX_SENDS_PER_HOUR = _int("M1_OTP_MAX_SENDS_PER_HOUR", 5)
OTP_MAX_VERIFY_ATTEMPTS = _int("M1_OTP_MAX_VERIFY_ATTEMPTS", 5)
OTP_LOCKOUT_SECONDS = _int("M1_OTP_LOCKOUT_SECONDS", 900)  # 15 minutes

# --- Login rate limiting / lockout ----------------------------------------
LOGIN_IP_LIMIT = _int("M1_LOGIN_IP_LIMIT", 10)
LOGIN_IP_WINDOW_SECONDS = _int("M1_LOGIN_IP_WINDOW_SECONDS", 300)
LOGIN_ACCOUNT_LIMIT = _int("M1_LOGIN_ACCOUNT_LIMIT", 5)
LOGIN_ACCOUNT_WINDOW_SECONDS = _int("M1_LOGIN_ACCOUNT_WINDOW_SECONDS", 300)
LOGIN_LOCKOUT_SECONDS = _int("M1_LOGIN_LOCKOUT_SECONDS", 900)  # 15 minutes

# --- Password reset request throttle (F4) ---------------------------------
RESET_REQUEST_LIMIT = _int("M1_RESET_REQUEST_LIMIT", 3)
RESET_REQUEST_WINDOW_SECONDS = _int("M1_RESET_REQUEST_WINDOW_SECONDS", 3600)

# --- Link tokens (BRIEF_M1.md §6 / A5) ------------------------------------
WELCOME_TOKEN_TTL_SECONDS = _int("M1_WELCOME_TOKEN_TTL_SECONDS", 72 * 3600)
RESET_TOKEN_TTL_SECONDS = _int("M1_RESET_TOKEN_TTL_SECONDS", 30 * 60)

# --- Break-glass passkey (F5) ---------------------------------------------
PASSKEY_MAX_FAILURES = _int("M1_PASSKEY_MAX_FAILURES", 5)
PASSKEY_LOCKOUT_SECONDS = _int("M1_PASSKEY_LOCKOUT_SECONDS", 900)

# --- Password policy (BRIEF_M1.md §6) -------------------------------------
PASSWORD_MIN_LENGTH = _int("M1_PASSWORD_MIN_LENGTH", 10)
