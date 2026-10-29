"""Public showcase slug derivation + reserved-words blocklist (BRIEF_M4 §3 D3).

One rule set (P4): the slug of a club showcase is DERIVED from
``institution name + club name`` — it is never free text — and validated
against a blocklist at every write. The blocklist has three layers:

* ``RESERVED_WORDS`` — platform routes/roles no public slug may claim
  (``admin``, ``api``, ``login``, …). A slug is blocked when ANY 1–2 word
  window normalises to one of these, which also kills the hyphen/underscore
  variants (``log-in``, ``Log_In``, ``SIGN.UP`` all resolve to ``login``).
* ``IMPERSONATION_TOKENS`` — authority-claiming words (``official``,
  ``helpdesk``, …) blocked ANYWHERE inside the slug (containment), because a
  public slug must never impersonate the platform or an office.
* ``PROFANITY_TOKENS`` — same containment rule.

The bias is fail-closed (P0): a false positive refuses a write with a clear
error; a false negative would publish an impersonation slug. The checks run
on the FINAL slug (suffix included) at write time — never only at derivation.
"""

from __future__ import annotations

import re
import unicodedata

#: Longest slug body kept from the derivation (suffixes get the rest).
SLUG_MAX_LENGTH = 150

#: Platform routes and role names (case/variant-insensitive, see windows).
RESERVED_WORDS = frozenset(
    {
        "accounts",
        "admin",
        "api",
        "assets",
        "dashboard",
        "docs",
        "edit",
        "health",
        "join",
        "login",
        "logout",
        "media",
        "new",
        "onboarding",
        "passkey",
        "portal",
        "qr",
        "register",
        "robots",
        "schema",
        "settings",
        "signin",
        "signup",
        "sitemap",
        "staff",
        "static",
        "swagger",
        "verify",
    }
)

#: Authority-claiming words — blocked ANYWHERE in the slug (containment).
IMPERSONATION_TOKENS = frozenset(
    {
        "controllerofexams",
        "grievancecell",
        "helpdesk",
        "iitkgpadmin",
        "ndliadmin",
        "official",
        "postmaster",
        "registraroffice",
        "superadmin",
        "webmaster",
    }
)

#: Small profanity set — blocked ANYWHERE in the slug (containment).
PROFANITY_TOKENS = frozenset(
    {
        "asshole",
        "bastard",
        "bitch",
        "cunt",
        "dickhead",
        "faggot",
        "fuck",
        "nigger",
        "shit",
        "slut",
        "wanker",
        "whore",
    }
)

_SEPARATOR_RE = re.compile(r"[^a-z0-9]+")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]")


class SlugBlockedError(ValueError):
    """A derived/edited slug claims a reserved, impersonating or foul word."""

    def __init__(self, message: str, *, word: str) -> None:
        super().__init__(message)
        self.message = message
        self.word = word


def normalize_slug(value: str) -> str:
    """Deterministic slug form: ascii, lowercase, single hyphens.

    Underscores, dots and every other separator collapse to ``-`` first, so
    ``log_in`` / ``Log.In`` / ``log--in`` all normalise to ``log-in`` and the
    blocklist cannot be dodged with punctuation variants.
    """
    text = unicodedata.normalize("NFKD", str(value))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    text = _SEPARATOR_RE.sub("-", text)
    return text.strip("-")


def _windows(tokens: list[str], size: int) -> list[str]:
    return ["".join(tokens[i : i + size]) for i in range(len(tokens) - size + 1)]


def blocked_reason(slug: str) -> str | None:
    """The blocklist word this slug claims, or ``None`` when it is clean."""
    normalized = normalize_slug(slug)
    if not normalized:
        return "empty"
    tokens = [part for part in normalized.split("-") if part]
    # 1- and 2-token windows catch segmented variants ("log-in" -> "login").
    for word in sorted(RESERVED_WORDS):
        for candidate in _windows(tokens, 1) + _windows(tokens, 2):
            if candidate == word:
                return word
    dehyphenated = _NON_ALNUM_RE.sub("", normalized)
    for word in sorted(IMPERSONATION_TOKENS | PROFANITY_TOKENS):
        if word in dehyphenated:
            return word
    return None


def validate_slug(slug: str) -> str:
    """Return the normalised slug, or raise :class:`SlugBlockedError`.

    Pure validation: it never truncates — an existing slug is immutable
    public identity, and truncation belongs to derivation only.
    """
    normalized = normalize_slug(slug)
    word = blocked_reason(normalized)
    if word is not None:
        raise SlugBlockedError(
            f"The slug claims a blocked word ({word!r}); rename the club "
            "or institution so the derived address is clean.",
            word=word,
        )
    return normalized


def derive_slug(
    institution_name: str,
    club_name: str,
    *,
    taken: set[str] | None = None,
) -> str:
    """Collision-safe slug from institution + club names (BRIEF_M4 §3 D3).

    ``taken`` holds every slug already published; a collision appends
    ``-2``, ``-3``, … Every candidate (suffix included) is re-checked
    against the blocklist at derivation time and again at write time.
    """
    base = normalize_slug(f"{institution_name} {club_name}")[:SLUG_MAX_LENGTH]
    base = validate_slug(base.strip("-"))
    if not base:
        raise SlugBlockedError(
            "Institution and club names yield no usable slug.", word="empty"
        )
    occupied = taken or set()
    candidate = base
    counter = 2
    while candidate in occupied:
        suffix = f"-{counter}"
        stem = base[: SLUG_MAX_LENGTH - len(suffix)].strip("-")
        candidate = f"{validate_slug(stem)}{suffix}"
        counter += 1
    return candidate
