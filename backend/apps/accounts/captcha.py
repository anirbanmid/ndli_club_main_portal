"""Login captcha — the office gate (owner 2026-10-27, previous-project pattern).

Employee code + password + captcha for office use: the module gate must work
with NO mail server running and must not burn email quota, so the challenge is
image-based and fully server-held.

* The answer lives ONLY in the Django session (server-side) — nothing forgeable
  ever reaches the client (P0).
* One-shot: ``consume_captcha`` pops the row on EVERY attempt, so each try
  (right or wrong) burns the challenge and the UI must fetch a fresh image.
* Short TTL (10 minutes) — a stale image is dead.
* The SVG is rendered from the stdlib only (no Pillow, no new dependency).
"""
from __future__ import annotations

import hmac
import random
import time
from typing import Any

#: Session slot holding the current challenge.
CAPTCHA_SESSION_KEY = "login_captcha"
#: Seconds a minted challenge stays alive.
CAPTCHA_TTL_SECONDS = 600
#: Unambiguous alphabet — no 0/O/o, 1/I/l/i confusables.
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz"
CODE_LENGTH = 5

_PALETTE = ("#103125", "#1A503E", "#0D7751", "#2E4A3E", "#5A7366")


def _new_code() -> str:
    rnd = random.SystemRandom()
    while True:
        code = "".join(rnd.choice(ALPHABET) for _ in range(CODE_LENGTH))
        if any(ch.isupper() for ch in code) and any(ch.islower() for ch in code):
            return code


def issue_captcha(request: Any) -> bytes:
    """Mint a fresh challenge into the session and return its SVG rendering."""
    code = _new_code()
    request.session[CAPTCHA_SESSION_KEY] = {
        "answer": code,
        "expires": time.time() + CAPTCHA_TTL_SECONDS,
    }
    return _render_svg(code)


def consume_captcha(request: Any, answer: str) -> bool:
    """ONE-SHOT check: every login attempt burns the challenge.

    Returns True only when a live challenge matches (case-sensitive). The
    row is popped BEFORE the comparison — a wrong guess cannot retry the same
    challenge (brute-force amplifier removed).
    """
    row = request.session.pop(CAPTCHA_SESSION_KEY, None)
    if not isinstance(row, dict):
        return False
    if time.time() > float(row.get("expires", 0)):
        return False
    return hmac.compare_digest(str(row.get("answer", "")), answer.strip())


def _render_svg(code: str) -> bytes:
    """Render the code as a dependency-free SVG with per-glyph jitter + noise."""
    rnd = random.SystemRandom()
    width, height = 168, 52
    parts: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" aria-label="captcha">',
        f'<rect width="{width}" height="{height}" fill="#F4F8F6"/>',
    ]
    # Noise lines behind the glyphs.
    for _ in range(6):
        x1, y1 = rnd.randint(0, width), rnd.randint(0, height)
        x2, y2 = rnd.randint(0, width), rnd.randint(0, height)
        color = rnd.choice(_PALETTE)
        parts.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="{color}" stroke-width="1.2" opacity="0.35"/>'
        )
    # The glyphs — one rotated <text> each.
    for i, ch in enumerate(code):
        x = 18 + i * 30 + rnd.randint(-2, 2)
        y = 40 + rnd.randint(-3, 3)
        rot = rnd.randint(-10, 10)
        size = 34 + rnd.randint(-2, 2)
        color = rnd.choice(_PALETTE)
        parts.append(
            f'<text x="{x}" y="{y}" font-family="monospace" font-size="{size}" '
            f'font-weight="bold" fill="{color}" '
            f'transform="rotate({rot} {x} {y})">{ch}</text>'
        )
    # Noise dots on top.
    for _ in range(12):
        parts.append(
            f'<circle cx="{rnd.randint(0, width)}" cy="{rnd.randint(0, height)}" '
            f'r="1.1" fill="{rnd.choice(_PALETTE)}" opacity="0.4"/>'
        )
    parts.append("</svg>")
    return "".join(parts).encode("utf-8")
