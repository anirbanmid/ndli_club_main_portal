"""Sliding-window rate limiting and account lockout (BRIEF_M1.md §2a).

Throttles are keyed per IP and per account on: login, OTP send, OTP verify
and password reset. Every lockout is audited by the callers via the
``@audit_action`` rows (actions ``auth.lockout`` / ``email_otp.lockout``).
"""

from __future__ import annotations

import ipaddress
import time

from django.conf import settings
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


_TRUSTED_PROXY_DEFAULTS = (
    "127.0.0.0/8",
    "::1/128",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
)


def _is_trusted_proxy(ip: str) -> bool:
    """True when ``ip`` is an edge proxy allowed to speak for the client."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    cidrs = getattr(settings, "TRUSTED_PROXY_CIDRS", _TRUSTED_PROXY_DEFAULTS)
    for cidr in cidrs:
        try:
            if addr in ipaddress.ip_network(cidr):
                return True
        except ValueError:
            continue
    return False


def client_ip(request: object) -> str:
    """Client IP for throttle keys (H1: X-Forwarded-For spoofing fix).

    XFF is honoured ONLY when REMOTE_ADDR is a trusted proxy (edge nginx /
    platform router), and then the RIGHTMOST hop wins - that is the hop our
    own proxy appended; anything to its left is client-supplied and ignored.
    Direct connections never get to choose their throttle key.
    """
    meta = getattr(request, "META", {})
    remote = str(meta.get("REMOTE_ADDR", "")).strip()
    forwarded = str(meta.get("HTTP_X_FORWARDED_FOR", "")).strip()
    if forwarded and _is_trusted_proxy(remote):
        hops = [h.strip() for h in forwarded.split(",") if h.strip()]
        if hops:
            return hops[-1]
    return remote or "unknown"
