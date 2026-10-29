"""Club showcase, campus passkey and campus self-join services (M4 D3).

Single source (P4): every D3 rule lives HERE; views are thin adapters and
the policy layer (``accounts.policies``) owns every access decision (I5).

* Showcase writes derive the public slug (``apps.clubs.slugs``) with the
  reserved-words blocklist enforced AT WRITE (W4); the slug is immutable
  after create — the URL is public identity.
* Campus passkeys follow the M1 secret rules (``accounts.hashing``): shown
  ONCE, keyed-hash at rest, TTL-bound, one active per club (regenerate
  replaces the hash = old code dead), admin-revocable (P5 bounded repair).
* Join tokens are minted and verified by ``apps.clubs.join_tokens``, which
  delegates ALL cryptography to the ONE M3 signer (P4 — one keyring, one
  canonical framing, one constant-time verify).
* The join flow reuses the M1 email-OTP machinery
  (``accounts.services.send_email_otp`` / ``verify_email_otp``) and
  ``accounts.services.student_account_for_join`` — no new auth primitive
  (P0/U4). Rate-limited per IP and per IP+club.
* Public payloads are PUBLIC-SAFE AGGREGATES ONLY (M4-A2, P0): zero student
  PII (names, emails, usernames) ever appears on a public path.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import segno
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import Throttled

from apps.accounts import services as accounts_services
from apps.accounts.hashing import generate_campus_code, hash_secret, verify_secret
from apps.accounts.throttles import client_ip, sliding_window_allow
from apps.domain import queries as domain_queries
from apps.domain.models import Club, Membership
from apps.members.models import JoinRequest

from . import join_tokens, slugs
from .join_tokens import JoinTokenError
from .models import CampusPasskey, ClubShowcase, ShowcaseSection

# --- Tunables (single source, P4) ------------------------------------------
#: Purpose string of the campus self-join OTP (writer and verifier share it).
OTP_PURPOSE_CLUB_JOIN = "club_join"
#: The QR wraps a signed join URL valid this long (campus-poster reality).
JOIN_TOKEN_TTL_SECONDS = 24 * 3600
#: Campus passkey lifetime (a term); regenerate restarts it.
PASSKEY_TTL_SECONDS = 90 * 24 * 3600
#: Rate limits: per client IP on the join door, per IP+club on completions.
JOIN_ATTEMPT_LIMIT = 10
JOIN_ATTEMPT_WINDOW_SECONDS = 600
#: Showcase content caps (P1: bounded writes).
SHOWCASE_TAGLINE_MAX = 240
SHOWCASE_ABOUT_MAX = 5000
SHOWCASE_SECTIONS_MAX = 20
SHOWCASE_HEADING_MAX = 120
SHOWCASE_BODY_MAX = 2000


class ClubError(Exception):
    """D3 service error carrying a machine code + HTTP status for views."""

    def __init__(self, message: str, *, code: str, http_status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.http_status = http_status


def _audit(
    action: str, request: Any = None, *, actor: Any = None, **detail: Any
) -> None:
    """Append exactly one audit row for a D3 lifecycle event (M1 pattern)."""
    from apps.audit.services import record as audit_record

    actor_id = getattr(actor, "pk", None) if actor is not None else None
    audit_record(
        action=action,
        request=request,
        actor_id=int(actor_id) if actor_id is not None else None,
        actor_label=actor.get_username() if actor is not None else "",
        detail=detail,
    )


# --- Club resolution (scope-key data lookup, never an authz decision) ------


def club_of(user: Any) -> Club:
    """The club this account is scoped to (404 semantics when unscoped)."""
    code = str(getattr(user, "club_code", "") or "")
    club = (
        Club.objects.select_related(
            "institution", "institution__state", "institution__state__zone"
        )
        .filter(code=code)
        .first()
        if code
        else None
    )
    if club is None:
        raise ClubError(
            "No club is scoped to this account.", code="no_club", http_status=404
        )
    return club


# --- Showcase (public-safe by construction) --------------------------------


def _identity_payload(club: Club) -> dict[str, Any]:
    """Public identity of a club: names + geography, nothing personal (P0)."""
    institution = club.institution
    state = institution.state
    district = institution.district
    return {
        "club": {"code": club.code, "name": club.name, "status": club.status},
        "institution": {"code": institution.code, "name": institution.name},
        "zone": {"code": state.zone.code, "name": state.zone.name},
        "state": {"code": state.code, "name": state.name},
        "district": (
            {"code": district.code, "name": district.name}
            if district is not None
            else None
        ),
    }


def showcase_payload(showcase: ClubShowcase) -> dict[str, Any]:
    """The PUBLIC showcase body (M4-A2: identity + aggregates, zero PII)."""
    club = showcase.club
    return {
        "slug": showcase.slug,
        "tagline": showcase.tagline,
        "about": showcase.about,
        **_identity_payload(club),
        "sections": [
            {"heading": section.heading, "body": section.body}
            for section in showcase.sections.all()
        ],
        "roster": domain_queries.roster_aggregates(club.code),
    }


def showcase_for_club(club: Club) -> ClubShowcase | None:
    return ClubShowcase.objects.filter(club=club).first()


def _clean_sections(sections: Any) -> list[dict[str, str]]:
    if sections is None:
        return []
    if not isinstance(sections, list):
        raise ClubError(
            "sections must be a list of {heading, body} objects.",
            code="invalid_sections",
        )
    if len(sections) > SHOWCASE_SECTIONS_MAX:
        raise ClubError(
            f"A showcase keeps at most {SHOWCASE_SECTIONS_MAX} sections.",
            code="too_many_sections",
        )
    cleaned: list[dict[str, str]] = []
    for item in sections:
        if not isinstance(item, dict):
            raise ClubError(
                "sections must be a list of {heading, body} objects.",
                code="invalid_sections",
            )
        heading = str(item.get("heading", "")).strip()
        body = str(item.get("body", "")).strip()
        if not heading or not body:
            raise ClubError(
                "Every showcase section needs a heading and a body.",
                code="invalid_sections",
            )
        if len(heading) > SHOWCASE_HEADING_MAX or len(body) > SHOWCASE_BODY_MAX:
            raise ClubError("A showcase section is too long.", code="section_too_long")
        cleaned.append({"heading": heading, "body": body})
    return cleaned


def upsert_showcase(
    *,
    club: Club,
    tagline: str = "",
    about: str = "",
    sections: Any = None,
    request: Any = None,
) -> ClubShowcase:
    """Create or update the club's showcase; slug derived ONCE, at create.

    W4: the derived slug is blocklist-checked at write (again inside
    ``ClubShowcase.save`` — the model refuses blocked slugs on EVERY write
    path). A blocked derivation refuses the write with a clear error; a
    slug collision appends ``-2``, ``-3``, … (collision-safe).
    """
    tagline = str(tagline).strip()
    about = str(about).strip()
    if len(tagline) > SHOWCASE_TAGLINE_MAX:
        raise ClubError("The tagline is too long.", code="tagline_too_long")
    if len(about) > SHOWCASE_ABOUT_MAX:
        raise ClubError("The about text is too long.", code="about_too_long")
    clean_sections = _clean_sections(sections)

    existing = ClubShowcase.objects.filter(club=club).first()
    created = existing is None
    if existing is None:
        taken = set(ClubShowcase.objects.values_list("slug", flat=True))
        try:
            slug = slugs.derive_slug(club.institution.name, club.name, taken=taken)
        except slugs.SlugBlockedError as exc:
            raise ClubError(exc.message, code="slug_blocked", http_status=409) from exc
        try:
            with transaction.atomic():
                showcase = ClubShowcase.objects.create(
                    club=club, slug=slug, tagline=tagline, about=about
                )
                _write_sections(showcase, clean_sections)
        except IntegrityError as exc:  # concurrent publish of the same slug
            raise ClubError(
                "Another club just published that address; retry.",
                code="slug_collision",
                http_status=409,
            ) from exc
    else:
        with transaction.atomic():
            existing.tagline = tagline
            existing.about = about
            existing.save(update_fields=["tagline", "about", "updated_at"])
            _write_sections(existing, clean_sections)
        showcase = existing
    _audit(
        "club.showcase_update",
        request,
        object_type="showcase",
        object_id=showcase.slug,
        club=club.code,
        created=created,
        sections=len(clean_sections),
    )
    return showcase


def _write_sections(showcase: ClubShowcase, cleaned: list[dict[str, str]]) -> None:
    """Replace-set semantics: one transaction, positions rebuilt in order."""
    showcase.sections.all().delete()
    ShowcaseSection.objects.bulk_create(
        [
            ShowcaseSection(
                showcase=showcase,
                heading=item["heading"],
                body=item["body"],
                position=position,
            )
            for position, item in enumerate(cleaned)
        ]
    )


# --- Campus passkey lifecycle ---------------------------------------------


def _normalize_code(value: str) -> str:
    """Accept the code however the student types it (case/space-insensitive)."""
    return str(value).strip().upper().replace(" ", "")


def _mint_code(club: Club) -> str:
    return generate_campus_code(club.code.split("-", 1)[0])


def passkey_payload(club: Club) -> dict[str, Any] | None:
    """Passkey STATUS without any secret material (P0: hash never leaves)."""
    row = CampusPasskey.objects.filter(club=club).first()
    return row.status_payload if row is not None else None


def issue_passkey(*, club: Club, issued_by: Any = None, request: Any = None) -> str:
    """Issue the club's first campus passkey; plaintext returned ONCE."""
    if CampusPasskey.objects.filter(club=club).exists():
        raise ClubError(
            "A campus passkey already exists for this club; regenerate it instead.",
            code="passkey_exists",
            http_status=409,
        )
    code = _mint_code(club)
    CampusPasskey.objects.create(
        club=club,
        code_hash=hash_secret(_normalize_code(code)),
        created_by=issued_by,
        expires_at=timezone.now() + timedelta(seconds=PASSKEY_TTL_SECONDS),
        is_active=True,
    )
    _audit(
        "club_passkey.issue",
        request,
        object_type="passkey",
        object_id=club.code,
        club=club.code,
    )
    return code


def regenerate_passkey(
    *, club: Club, issued_by: Any = None, request: Any = None
) -> str:
    """Rotate the passkey: the new hash INVALIDATES the previous code (W5)."""
    code = _mint_code(club)
    now = timezone.now()
    row = CampusPasskey.objects.filter(club=club).first()
    if row is None:
        row = CampusPasskey.objects.create(
            club=club,
            code_hash=hash_secret(_normalize_code(code)),
            created_by=issued_by,
            expires_at=now + timedelta(seconds=PASSKEY_TTL_SECONDS),
            is_active=True,
        )
    else:
        row.code_hash = hash_secret(_normalize_code(code))
        row.created_by = issued_by
        row.rotated_at = now
        row.revoked_at = None
        row.expires_at = now + timedelta(seconds=PASSKEY_TTL_SECONDS)
        row.is_active = True
        row.save(
            update_fields=[
                "code_hash",
                "created_by",
                "rotated_at",
                "revoked_at",
                "expires_at",
                "is_active",
            ]
        )
    _audit(
        "club_passkey.rotate",
        request,
        object_type="passkey",
        object_id=club.code,
        club=club.code,
    )
    return code


def revoke_passkey(*, club: Club, request: Any = None) -> dict[str, Any]:
    """Revoke the passkey (bounded repair for leak suspicion, P5; audited)."""
    row = CampusPasskey.objects.filter(club=club).first()
    if row is None:
        raise ClubError(
            "No campus passkey exists for this club.",
            code="passkey_missing",
            http_status=404,
        )
    if row.is_active:
        row.is_active = False
        row.revoked_at = timezone.now()
        row.save(update_fields=["is_active", "revoked_at"])
        _audit(
            "club_passkey.revoke",
            request,
            object_type="passkey",
            object_id=club.code,
            club=club.code,
        )
    return row.status_payload


def resolve_passkey(code: str) -> CampusPasskey:
    """Resolve a typed campus code to its passkey row (W5 lifecycle rules).

    The code is stored as a DETERMINISTIC keyed hash (``accounts.hashing``),
    so the lookup is one indexed equality — an attacker without the key
    cannot precompute candidates, and the hash alone reveals nothing (P0).
    """
    normalized = _normalize_code(code)
    if not normalized:
        raise ClubError("A passkey is required.", code="passkey_missing")
    row = (
        CampusPasskey.objects.select_related(
            "club",
            "club__institution",
            "club__institution__state",
            "club__institution__state__zone",
        )
        .filter(code_hash=hash_secret(normalized))
        .first()
    )
    if row is None or not verify_secret(normalized, row.code_hash):
        raise ClubError("That passkey is not valid.", code="passkey_invalid")
    if not row.is_active:
        raise ClubError("That passkey is no longer active.", code="passkey_revoked")
    if row.expires_at <= timezone.now():
        raise ClubError("That passkey has expired.", code="passkey_expired")
    return row


# --- Join flow (passkey or signed QR token -> OTP -> pending) --------------


@dataclass(frozen=True)
class JoinCredential:
    """A verified join capability: WHICH club + how it proved itself."""

    club: Club
    source: str  # "passkey" | "qr"


def resolve_credential(*, passkey: str = "", token: str = "") -> JoinCredential:
    """Resolve the self-join credential (typed passkey OR signed join URL)."""
    if token and passkey:
        raise ClubError(
            "Provide either a passkey or a join link, not both.",
            code="credential_conflict",
        )
    if token:
        try:
            parsed = join_tokens.parse_join_token(token)
        except JoinTokenError as exc:
            status = 410 if exc.code == "token_expired" else 400
            raise ClubError(exc.message, code=exc.code, http_status=status) from exc
        club = (
            Club.objects.select_related(
                "institution", "institution__state", "institution__state__zone"
            )
            .filter(code=parsed.club_code)
            .first()
        )
        if club is None:
            raise ClubError("That join link is not valid.", code="token_invalid")
        return JoinCredential(club=club, source="qr")
    if passkey:
        return JoinCredential(club=resolve_passkey(passkey).club, source="passkey")
    raise ClubError("A passkey or join link is required.", code="credential_missing")


def _throttle_club_attempt(credential: JoinCredential, request: Any) -> None:
    """Per IP+club sliding window (BRIEF_M4 §4c)."""
    if request is None:
        return
    key = f"clubs:join:{client_ip(request)}:{credential.club.code}"
    if not sliding_window_allow(key, JOIN_ATTEMPT_LIMIT, JOIN_ATTEMPT_WINDOW_SECONDS):
        raise Throttled(detail="Too many join attempts. Try again later.")


def _validated_email(email: str) -> str:
    normalized = accounts_services.normalize_email(email)
    if not normalized or "@" not in normalized:
        raise ClubError("A valid email address is required.", code="invalid_email")
    return normalized


def request_join_otp(
    *,
    passkey: str = "",
    token: str = "",
    email: str,
    request: Any = None,
) -> JoinCredential:
    """Step 1 of the join: verify the credential, email an OTP to the student.

    The answer is the same for every address (no enumeration, P0); the OTP
    machinery itself rate-limits per recipient (M1) and the endpoints
    throttle per IP + per IP+club.
    """
    credential = resolve_credential(passkey=passkey, token=token)
    _throttle_club_attempt(credential, request)
    normalized = _validated_email(email)
    accounts_services.send_email_otp(
        email=normalized,
        purpose=OTP_PURPOSE_CLUB_JOIN,
        request=request,
    )
    return credential


def complete_join(
    *,
    passkey: str = "",
    token: str = "",
    email: str,
    code: str,
    request: Any = None,
) -> JoinRequest:
    """Step 2: consume the OTP, join THIS club's roster as ``pending``.

    W5: the join always lands on the credential's club ("student joins ONLY
    the target club") and a replayed request fails twice over — the OTP is
    single-use (M1) and one pending request per (user, club) is enforced by
    a database constraint. The club admin confirms the request in the roster
    view (``apps.members.services``) before any membership exists.
    """
    credential = resolve_credential(passkey=passkey, token=token)
    _throttle_club_attempt(credential, request)
    normalized = _validated_email(email)
    accounts_services.verify_email_otp(
        email=normalized,
        code=str(code).strip(),
        purpose=OTP_PURPOSE_CLUB_JOIN,
        request=request,
    )
    account = accounts_services.student_account_for_join(
        email=normalized, club=credential.club, request=request
    )
    if Membership.objects.filter(user=account, club=credential.club).exists():
        raise ClubError(
            "That account is already a member of this club.",
            code="already_member",
            http_status=409,
        )
    try:
        # Inner atomic: a uniqueness race rolls back ONLY this savepoint, so
        # the request transaction stays clean on both engines (P2).
        with transaction.atomic():
            join_request = JoinRequest.objects.create(
                user=account, club=credential.club, source=credential.source
            )
    except IntegrityError as exc:  # one pending request per (user, club)
        raise ClubError(
            "A pending join request already exists for that account.",
            code="join_pending_exists",
            http_status=409,
        ) from exc
    _audit(
        "club_join.requested",
        request,
        actor=account,
        object_type="join_request",
        object_id=str(join_request.pk),
        club=credential.club.code,
        source=credential.source,
    )
    return join_request


# --- Dashboard + dynamic QR (admin surface, W9-gated at the view) ----------


def dashboard_payload(*, club: Club) -> dict[str, Any]:
    """The club dashboard body: identity, showcase/passkey state, counts."""
    showcase = ClubShowcase.objects.filter(club=club).first()
    return {
        **_identity_payload(club),
        "showcase": (
            {"slug": showcase.slug, "tagline": showcase.tagline}
            if showcase is not None
            else None
        ),
        "passkey": passkey_payload(club),
        "roster": {
            **domain_queries.roster_aggregates(club.code),
            "pending_joins": JoinRequest.objects.filter(
                club=club, status=JoinRequest.Status.PENDING
            ).count(),
        },
    }


def join_path_for(*, token: str) -> str:
    """The join-flow path a QR wraps.

    The signed token travels in the URL FRAGMENT (never a query string — the
    M3 delivery rule): fragments are not sent to servers or written to logs.
    """
    return f"/join#t={token}"


def mint_join_token(*, club: Club) -> tuple[str, datetime]:
    """Fresh signed join token for THIS club (re-minted on every QR render)."""
    return join_tokens.issue_join_token(
        club_code=club.code, ttl_seconds=JOIN_TOKEN_TTL_SECONDS
    )


def render_join_qr_svg(join_url: str) -> bytes:
    """Render the dynamic QR as SVG (re-rendered per page load, never cached)."""
    buffer = io.BytesIO()
    segno.make(join_url, error="m").save(buffer, kind="svg", scale=5, border=2)
    return buffer.getvalue()
