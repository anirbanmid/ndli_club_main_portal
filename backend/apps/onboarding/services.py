"""Onboarding services (BRIEF_M4 §3 D2) — draft lifecycle, per-authority OTP,
hardened upload, charter-queue submission.

Single source (P4): every wizard rule lives HERE; views are thin adapters.
Reuses the M1 email-OTP machinery (``accounts.services.send_email_otp`` /
``verify_email_otp``) — no new auth primitive (P0, U4). Upload handling is
W3-hardened: extension + MIME + magic-byte agreement, size cap, content-hash
storage names (never user filenames), downloads only as attachments.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from pathlib import Path
from typing import Any, BinaryIO

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.services import send_email_otp, verify_email_otp

from .models import (
    AuthorityRole,
    CharterApplication,
    OnboardingAuthority,
    OnboardingDraft,
    OnboardingUpload,
)

# --- Tunables (single source, P4) ------------------------------------------
OTP_PURPOSE_ONBOARDING = "onboarding_authority"
RESUME_TOKEN_TTL_HOURS = 72
UPLOAD_MAX_BYTES = 10 * 1024 * 1024  # one combined document, 10 MB hard cap
#: Owner decision 2026-10-21: combined document = jpeg/pdf only.
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".jpg", ".jpeg"}
#: Claimed MIME -> magic-byte prefixes that MUST match the content (W3:
#: double-extension and polyglot files fail this agreement).
ALLOWED_UPLOAD_MIMES: dict[str, tuple[bytes, ...]] = {
    "application/pdf": (b"%PDF-",),
    "image/jpeg": (b"\xff\xd8\xff",),
}


class OnboardingError(Exception):
    """Wizard-level error carrying a machine code + HTTP status for views."""

    def __init__(self, message: str, *, code: str, http_status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.http_status = http_status


def _sha256_hex(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _upload_root() -> Path:
    return Path(
        getattr(
            settings, "ONBOARDING_UPLOAD_ROOT", Path(settings.BASE_DIR) / "var"
        )
    )


# --- Draft lifecycle -------------------------------------------------------
def create_draft(
    *,
    institution_name: str,
    club_name: str,
    zone_code: str,
    state_code: str,
    district_code: str,
    aishe_code: str = "",
) -> tuple[OnboardingDraft, str]:
    """Start a wizard draft; returns the draft + the RAW resume token (once).

    Only the token hash is persisted (P0). The raw token is handed to the
    caller exactly once — it is the capability for every later step.
    """
    for label, value in (
        ("institution name", institution_name),
        ("club name", club_name),
        ("zone code", zone_code),
        ("state code", state_code),
        ("district code", district_code),
    ):
        if not str(value).strip():
            raise OnboardingError(f"A {label} is required.", code="missing_field")
    raw_token = secrets.token_urlsafe(32)
    try:
        draft = OnboardingDraft.objects.create(
            institution_name=institution_name.strip(),
            aishe_code=aishe_code.strip(),
            club_name=club_name.strip(),
            zone_code=zone_code.strip(),
            state_code=state_code.strip(),
            district_code=district_code.strip(),
            resume_token_hash=_sha256_hex(raw_token.encode("utf-8")),
            resume_token_expires_at=timezone.now()
            + timedelta(hours=RESUME_TOKEN_TTL_HOURS),
        )
    except IntegrityError as exc:  # one active draft per club
        raise OnboardingError(
            "A draft already exists for this club.",
            code="draft_exists",
            http_status=409,
        ) from exc
    return draft, raw_token


def get_draft_by_token(raw_token: str) -> OnboardingDraft:
    """Resolve the resume capability; W1: expired drafts refuse to resume."""
    if not raw_token:
        raise OnboardingError("A resume token is required.", code="missing_token")
    draft = (
        OnboardingDraft.objects.filter(resume_token_hash=_sha256_hex(raw_token.encode()))
        .first()
    )
    if draft is None:
        raise OnboardingError(
            "Draft not found.", code="draft_not_found", http_status=404
        )
    if draft.status != OnboardingDraft.Status.DRAFT:
        raise OnboardingError(
            "This draft is no longer editable.", code="draft_closed", http_status=410
        )
    if draft.resume_token_expires_at <= timezone.now():
        draft.status = OnboardingDraft.Status.EXPIRED
        draft.save(update_fields=["status"])
        raise OnboardingError(
            "This draft has expired. Start a new one.",
            code="draft_expired",
            http_status=410,
        )
    return draft


def rotate_resume_token(draft: OnboardingDraft) -> str:
    """Issue a fresh resume token (old one dies with the row update)."""
    raw_token = secrets.token_urlsafe(32)
    draft.resume_token_hash = _sha256_hex(raw_token.encode("utf-8"))
    draft.resume_token_expires_at = (
        timezone.now() + timedelta(hours=RESUME_TOKEN_TTL_HOURS)
    )
    draft.save(
        update_fields=[
            "resume_token_hash",
            "resume_token_expires_at",
            "updated_at",
        ]
    )
    return raw_token


def update_identity(draft: OnboardingDraft, **fields: str) -> None:
    """Identity step; only non-empty values change (partial updates safe)."""
    allowed = {
        "institution_name",
        "aishe_code",
        "club_name",
        "zone_code",
        "state_code",
        "district_code",
    }
    for key, value in fields.items():
        if key not in allowed:
            continue
        if key != "aishe_code" and not str(value).strip():
            raise OnboardingError(f"{key} cannot be empty.", code="missing_field")
        setattr(draft, key, str(value).strip())
    draft.save()


# --- Authority slots (W1: step completes only after an OTP pass) -----------
def upsert_authority(
    draft: OnboardingDraft, role: str, **fields: str
) -> OnboardingAuthority:
    if role not in AuthorityRole.values:
        raise OnboardingError(
            "Unknown authority role.", code="unknown_role", http_status=404
        )
    email = str(fields.get("email", "")).strip().lower()
    if not email:
        raise OnboardingError("An email is required.", code="missing_field")
    authority, _created = OnboardingAuthority.objects.update_or_create(
        draft=draft,
        role=role,
        defaults={
            "full_name": str(fields.get("full_name", "")).strip(),
            "email": email,
            "phone": str(fields.get("phone", "")).strip(),
            "designation": str(fields.get("designation", "")).strip(),
        },
    )
    return authority


def send_authority_otp(
    authority: OnboardingAuthority, request: Any = None, provider: Any = None
) -> None:
    """Send an OTP to THIS authority's address (purpose = onboarding)."""
    send_email_otp(
        email=authority.email,
        purpose=OTP_PURPOSE_ONBOARDING,
        request=request,
        provider=provider,
    )


def verify_authority_otp(
    authority: OnboardingAuthority, code: str, request: Any = None
) -> None:
    """Consume the code for THIS authority's email; mark the step passed.

    W2: a code issued to another address never validates this step (the M1
    verifier resolves by email+purpose), and replays fail (single-use).
    """
    verify_email_otp(
        email=authority.email,
        code=code,
        purpose=OTP_PURPOSE_ONBOARDING,
        request=request,
    )
    authority.otp_verified_at = timezone.now()
    authority.save(update_fields=["otp_verified_at"])


# --- Upload (W3) -----------------------------------------------------------
def store_combined_document(draft: OnboardingDraft, uploaded: Any) -> OnboardingUpload:
    """Validate + store the ONE combined document (jpeg/pdf).

    W3: extension, claimed MIME and magic bytes must AGREE; size capped;
    stored name is the content SHA-256 (never the user filename); bytes land
    in private storage and are only ever served as attachments.
    """
    name = str(uploaded.name or "")
    suffix = Path(name).suffix.lower()
    claimed = str(uploaded.content_type or "").split(";")[0].strip().lower()
    size = int(uploaded.size or 0)

    if suffix not in ALLOWED_UPLOAD_EXTENSIONS:
        raise OnboardingError(
            "Only .pdf/.jpg/.jpeg documents are accepted.",
            code="bad_extension",
            http_status=400,
        )
    if claimed not in ALLOWED_UPLOAD_MIMES:
        raise OnboardingError(
            "Only PDF or JPEG documents are accepted.", code="bad_mime", http_status=400
        )
    if size <= 0 or size > UPLOAD_MAX_BYTES:
        raise OnboardingError(
            f"The document must be 1-{UPLOAD_MAX_BYTES // (1024 * 1024)} MB.",
            code="bad_size",
            http_status=400,
        )
    head = uploaded.read(8)
    uploaded.seek(0)
    if not any(head.startswith(magic) for magic in ALLOWED_UPLOAD_MIMES[claimed]):
        raise OnboardingError(
            "The document content does not match its declared type.",
            code="mime_mismatch",
            http_status=400,
        )

    digest = hashlib.sha256()
    chunks: list[bytes] = []
    stream: BinaryIO = uploaded  # type: ignore[assignment]
    for chunk in stream:
        digest.update(chunk)
        chunks.append(chunk)
    content_hash = digest.hexdigest()

    root = _upload_root()
    shard = root / content_hash[:2]
    shard.mkdir(parents=True, exist_ok=True)
    target = shard / content_hash
    target.write_bytes(b"".join(chunks))

    return OnboardingUpload.objects.update_or_create(
        draft=draft,
        defaults={
            "original_name": name[:255],
            "stored_name": content_hash,
            "content_sha256": content_hash,
            "mime_type": claimed,
            "size_bytes": size,
        },
    )[0]


def draft_is_complete(draft: OnboardingDraft) -> bool:
    """All four authority slots present, each OTP-passed, document stored."""
    roles = {
        a.role: a for a in OnboardingAuthority.objects.filter(draft=draft)
    }
    if set(roles) != set(AuthorityRole.values):
        return False
    if any(a.otp_verified_at is None for a in roles.values()):
        return False
    return OnboardingUpload.objects.filter(draft=draft).exists()


# --- Submission (charter queue) -------------------------------------------
def submit_draft(draft: OnboardingDraft, request: Any = None) -> CharterApplication:
    """W1 gate + enqueue: ONE CharterApplication row (status=queued) + audit."""
    if not draft_is_complete(draft):
        raise OnboardingError(
            "Every authority step must be OTP-verified and the document "
            "uploaded before submitting.",
            code="draft_incomplete",
            http_status=400,
        )
    try:
        with transaction.atomic():
            application = CharterApplication.objects.create(
                draft=draft,
                institution_name=draft.institution_name,
                club_name=draft.club_name,
                zone_code=draft.zone_code,
                state_code=draft.state_code,
                district_code=draft.district_code,
            )
            draft.status = OnboardingDraft.Status.SUBMITTED
            draft.save(update_fields=["status", "updated_at"])
    except IntegrityError as exc:  # one application per club
        raise OnboardingError(
            "An application for this club is already queued.",
            code="application_exists",
            http_status=409,
        ) from exc

    from apps.audit.services import record as audit_record

    audit_record(
        action="onboarding.submit",
        request=request,
        object_type="charter_application",
        object_id=str(application.id),
        detail={
            "draft_id": str(draft.id),
            "institution_name": draft.institution_name,
            "club_name": draft.club_name,
        },
    )
    return application
