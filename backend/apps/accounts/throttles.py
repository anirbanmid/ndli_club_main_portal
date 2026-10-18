"""Sliding-window rate limiting and account lockout (BRIEF_M1.md §2a).

Throttles are keyed per IP and per account on: login, OTP send, OTP verify
and password reset. Every lockout is audited by the callers via the
``@audit_action`` rows (actions ``auth.lockout`` / ``email_otp.lockout``).
"""
from __future__ import annotations

import time

from django.core.cache import cache


def sliding_window_allow(key: str, limit: int, window_seconds: int) -> bool:
    """Record one hit for ``key``; False when the sliding window is full."""
    now = time.time()
    cache_key = f"m1:rl:{key}"
    hits = [float(ts) for ts in cache.get(cache_key, [])]
    hits = [ts for ts in hits if now - ts < window_seconds]
    if len(hits) >= limit:
        cache.set(cache_key, hits, window_seconds)
        return False
    hits.append(now)
    cache.set(cache_key, hits, window_seconds)
    return True


def reset(key: str) -> None:
    """Forget the hits recorded for ``key`` (used after successful login)."""
    cache.delete(f"m1:rl:{key}")


def client_ip(request: object) -> str:
    """Best-effort client IP (first X-Forwarded-For hop, else REMOTE_ADDR)."""
    meta = getattr(request, "META", {})
    forwarded = str(meta.get("HTTP_X_FORWARDED_FOR", ""))
    if forwarded:
        return forwarded.split(",")[0].strip()
    return str(meta.get("REMOTE_ADDR", "unknown"))
