"""Dual-Layer Security Challenge -- PATCH 0018 (owner rules 2026-10-27).

AUTH-TURF (NEVER MIX):
  * SERVER-level actions   -> Master Admin (SUPEROPS) password.
  * BUSINESS-level actions -> Central Admin (CENTRALADM) password.

Mechanics (PLAN_0018_DUAL_LAYER.md sec.2):
  * Layer 1: dynamic Canvas CAPTCHA -- server-issued challenge token plus
    glyph draw instructions; the answer lives ONLY in the session and is
    ONE-SHOT (every attempt pops the row; replay is impossible). Same
    discipline as the office-login captcha (apps/accounts/captcha.py).
  * Layer 2: standard-hasher password check against the DOMAIN identity
    (CLIENT_SECURITY_STANDARD.md sec.2) -- a credential from the other turf
    can never pass because the candidate set is the domain sub-role only.
"""

from __future__ import annotations

import hmac
import random
import secrets
import time
from typing import Any

from django.contrib.auth import get_user_model

from .captcha import _PALETTE, CAPTCHA_TTL_SECONDS, _new_code, _render_svg
from .models import AccountState, SubRole

User = get_user_model()

#: Session slot: challenge token -> one-shot row (answer never leaves server).
SC_SESSION_KEY = "security_challenges"
#: Seconds a minted challenge stays alive (same TTL as the login captcha).
SC_TTL_SECONDS = CAPTCHA_TTL_SECONDS

#: The two turfs. NEVER MIX (owner 2026-10-27).
DOMAIN_BUSINESS = "business"
DOMAIN_SERVER = "server"

#: Single source of truth: turf -> sub-role whose password authorises it.
DOMAIN_IDENTITY_SUB_ROLE = {
    DOMAIN_BUSINESS: SubRole.CENTRAL_ADMIN,
    DOMAIN_SERVER: SubRole.SUPER_ADMIN_OPS,
}


def issue_challenge(request: Any, domain: str) -> dict[str, Any]:
    """Mint a one-shot Layer-1 challenge bound to ``domain``.

    Returns the challenge token, the SVG rendering (accessible fallback) and
    the canvas glyph draw instructions. The answer stays server-side (P0).
    """
    if domain not in DOMAIN_IDENTITY_SUB_ROLE:
        raise ValueError(f"unknown security domain: {domain!r}")
    code = _new_code()
    token = secrets.token_urlsafe(16)
    session = request.session
    slot = session.setdefault(SC_SESSION_KEY, {})
    now = time.time()
    dead = [key for key, row in slot.items() if float(row.get("expires", 0)) < now]
    for stale in dead:
        slot.pop(stale, None)
    slot[token] = {
        "answer": code,
        "domain": domain,
        "expires": now + SC_TTL_SECONDS,
    }
    if hasattr(session, "modified"):
        session.modified = True
    return {
        "token": token,
        "svg": _render_svg(code).decode("utf-8"),
        "draw": _draw_instructions(code),
        "expires_in": SC_TTL_SECONDS,
    }


def consume_challenge(request: Any, token: str, answer: str, domain: str) -> bool:
    """ONE-SHOT Layer-1 check: every attempt pops the row (replay-proof)."""
    session = request.session
    slot = session.get(SC_SESSION_KEY)
    row = slot.pop(token, None) if isinstance(slot, dict) else None
    if hasattr(session, "modified"):
        session.modified = True
    if not isinstance(row, dict):
        return False
    if time.time() > float(row.get("expires", 0)):
        return False
    if row.get("domain") != domain:
        return False
    return hmac.compare_digest(str(row.get("answer", "")), answer.strip())


def verify_domain_password(domain: str, password: str) -> Any | None:
    """Layer 2: check ``password`` against the DOMAIN identity (turf-true).

    Returns the matched active identity or ``None``. Only the domain
    sub-role is ever consulted, so a credential from the other turf (or an
    EMP credential) can never pass -- the turf separation is structural.
    """
    role = DOMAIN_IDENTITY_SUB_ROLE.get(domain)
    if role is None or not password:
        return None
    candidates = User.objects.filter(sub_role=role, account_state=AccountState.ACTIVE)
    for user in candidates.order_by("pk").iterator():
        if user.check_password(password):
            return user
    return None


def _draw_instructions(code: str) -> dict[str, Any]:
    """Canvas draw plan for the same glyphs the SVG renders (client draw)."""
    rnd = random.SystemRandom()
    width, height = 168, 52
    step = (width - 32) / max(len(code) - 1, 1)
    glyphs = [
        {
            "char": char,
            "x": 16 + index * step,
            "y": height / 2 + rnd.randint(-6, 6),
            "rotate": rnd.randint(-24, 24),
            "color": rnd.choice(_PALETTE),
        }
        for index, char in enumerate(code)
    ]
    noise = [
        {
            "x1": rnd.randint(0, width),
            "y1": rnd.randint(0, height),
            "x2": rnd.randint(0, width),
            "y2": rnd.randint(0, height),
            "color": rnd.choice(_PALETTE),
        }
        for _ in range(6)
    ]
    return {"width": width, "height": height, "glyphs": glyphs, "noise": noise}
