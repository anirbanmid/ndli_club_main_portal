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
import re
import secrets
from datetime import timedelta
from pathlib import Path
from typing import Any, BinaryIO

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, models, transaction
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


# --- Authority contact rules (DEC4, owner-locked 2026-10-23) ---------------
#: Every authority slot MUST carry a valid email, an Indian mobile (10 digits)
#: and a designation. Enforced HERE (P4 single source) and re-checked at
#: submit time, so a slot saved before this rule still cannot be submitted.
INDIAN_MOBILE_DIGITS = 10


def _normalize_indian_mobile(raw: object) -> str | None:
    """DEC4 (owner 2026-10-23): official-contact mobile = 10-digit Indian number.

    Accepts separators and the ``+91`` / ``0091`` / ``91`` / ``0`` prefixes and
    returns the normalised 10-digit number, or ``None`` when empty or
    malformed. ONE function decides accept/reject for BOTH ``upsert_authority``
    and the submit backstop (P4), and every verdict it drives is a literal
    string so it stays a key of the i18n catalogue.
    """
    digits = "" if raw is None else str(raw)
    digits = re.sub(r"[\s\-().]", "", digits)
    if digits.startswith("+91"):
        digits = digits[3:]
    elif digits.startswith("0091"):
        digits = digits[4:]
    if digits.startswith("91") and len(digits) == INDIAN_MOBILE_DIGITS + 2:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == INDIAN_MOBILE_DIGITS + 1:
        digits = digits[1:]
    #: ASCII-only: a Unicode look-alike digit is not a dialable Indian number.
    if len(digits) == INDIAN_MOBILE_DIGITS and digits.isascii() and digits.isdigit():
        return digits
    return None


def _validate_authority_fields(
    *, email: str, phone: str, designation: str
) -> tuple[str, str, str]:
    """DEC4 gate: valid email + 10-digit Indian mobile + non-empty designation.

    Raises ``OnboardingError`` carrying the field's verdict bytes so the
    wizard renders them against that field (F4); returns the NORMALISED
    values to store.
    """
    if not email:
        raise OnboardingError("An email is required.", code="missing_field")
    try:
        validate_email(email)
    except ValidationError as exc:
        raise OnboardingError(
            "A valid email address is required.", code="invalid_field"
        ) from exc

    mobile = _normalize_indian_mobile(phone)
    if mobile is None:
        if not str(phone or "").strip():
            raise OnboardingError(
                "An Indian mobile number is required.", code="missing_field"
            )
        raise OnboardingError(
            "The mobile number must be a 10-digit Indian number.",
            code="invalid_field",
        )

    if not designation:
        raise OnboardingError("A designation is required.", code="missing_field")

    return email, mobile, designation


def _authority_field_error(authority: OnboardingAuthority) -> OnboardingError | None:
    """The DEC4 verdict for ONE saved slot, or ``None`` when it satisfies."""
    try:
        _validate_authority_fields(
            email=authority.email,
            phone=authority.phone,
            designation=authority.designation,
        )
    except OnboardingError as exc:
        return exc
    return None


def _authority_fields_satisfied(authority: OnboardingAuthority) -> bool:
    """DEC4 backstop for ``draft_is_complete`` (never raises)."""
    return _authority_field_error(authority) is None


def _resolve_zone_for_state(state_code: str) -> str:
    """Auto-resolve regional zone code from the State table in the database,
    with fallback to the canonical 36-state national map.
    """
    clean_state = str(state_code).strip()
    if not clean_state:
        return ""
    try:
        from apps.domain.models import State

        state_obj = (
            State.objects.filter(
                models.Q(code__iexact=clean_state) | models.Q(name__iexact=clean_state)
            )
            .select_related("zone")
            .first()
        )
        if state_obj and state_obj.zone:
            return state_obj.zone.code
    except Exception:
        pass

    state_zone_map = {
        "ANDAMAN_AND_NICOBAR_ISLANDS": "SOUTH",
        "ANDHRA_PRADESH": "SOUTH",
        "ARUNACHAL_PRADESH": "NORTH_EAST",
        "ASSAM": "NORTH_EAST",
        "BIHAR": "EAST",
        "CHANDIGARH": "NORTH",
        "CHHATTISGARH": "CENTRAL",
        "DADRA_AND_NAGAR_HAVELI_AND_DAMAN_AND_DIU": "WEST",
        "DELHI": "NORTH",
        "GOA": "WEST",
        "GUJARAT": "WEST",
        "HARYANA": "NORTH",
        "HIMACHAL_PRADESH": "NORTH",
        "JAMMU_AND_KASHMIR": "NORTH",
        "JHARKHAND": "EAST",
        "KARNATAKA": "SOUTH",
        "KERALA": "SOUTH",
        "LADAKH": "NORTH",
        "LAKSHADWEEP": "SOUTH",
        "MADHYA_PRADESH": "CENTRAL",
        "MAHARASHTRA": "WEST",
        "MANIPUR": "NORTH_EAST",
        "MEGHALAYA": "NORTH_EAST",
        "MIZORAM": "NORTH_EAST",
        "NAGALAND": "NORTH_EAST",
        "ODISHA": "EAST",
        "PUDUCHERRY": "SOUTH",
        "PUNJAB": "NORTH",
        "RAJASTHAN": "WEST",
        "SIKKIM": "EAST",
        "TAMIL_NADU": "SOUTH",
        "TELANGANA": "SOUTH",
        "TRIPURA": "NORTH_EAST",
        "UTTAR_PRADESH": "NORTH",
        "UTTARAKHAND": "NORTH",
        "WEST_BENGAL": "EAST",
    }
    normalized = re.sub(r"[\s\-_]+", "_", clean_state.upper())
    if normalized in state_zone_map:
        return state_zone_map[normalized]

    abbr_map = {
        "AP": "ANDHRA_PRADESH", "AR": "ARUNACHAL_PRADESH", "AS": "ASSAM", "BR": "BIHAR",
        "CG": "CHHATTISGARH", "CH": "CHANDIGARH", "DL": "DELHI", "GA": "GOA",
        "GJ": "GUJARAT", "HP": "HIMACHAL_PRADESH", "HR": "HARYANA", "JH": "JHARKHAND",
        "JK": "JAMMU_AND_KASHMIR", "KA": "KARNATAKA", "KL": "KERALA", "LA": "LADAKH",
        "LD": "LAKSHADWEEP", "MH": "MAHARASHTRA", "ML": "MEGHALAYA", "MN": "MANIPUR",
        "MP": "MADHYA_PRADESH", "MZ": "MIZORAM", "NL": "NAGALAND", "OD": "ODISHA",
        "PB": "PUNJAB", "PY": "PUDUCHERRY", "RJ": "RAJASTHAN", "SK": "SIKKIM",
        "TN": "TAMIL_NADU", "TR": "TRIPURA", "TS": "TELANGANA", "UK": "UTTARAKHAND",
        "UP": "UTTAR_PRADESH", "WB": "WEST_BENGAL",
    }
    if clean_state.upper() in abbr_map:
        target = abbr_map[clean_state.upper()]
        return state_zone_map.get(target, "")

    return ""


# --- Draft lifecycle -------------------------------------------------------
def create_draft(
    *,
    institution_name: str,
    club_name: str,
    zone_code: str = "",
    state_code: str,
    district_code: str,
    aishe_code: str = "",
) -> tuple[OnboardingDraft, str]:
    """Start a wizard draft; returns the draft + the RAW resume token (once).

    Only the token hash is persisted (P0). The raw token is handed to the
    caller exactly once — it is the capability for every later step.
    """
    institution_name = str(institution_name).strip()
    club_name = str(club_name).strip()
    state_code = str(state_code).strip()
    district_code = str(district_code).strip()
    aishe_code = str(aishe_code).strip()
    zone_code = str(zone_code).strip()

    if not zone_code and state_code:
        zone_code = _resolve_zone_for_state(state_code)

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
            institution_name=institution_name,
            aishe_code=aishe_code,
            club_name=club_name,
            zone_code=zone_code,
            state_code=state_code,
            district_code=district_code,
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
    state_val = str(fields.get("state_code", getattr(draft, "state_code", ""))).strip()
    zone_val = str(fields.get("zone_code", "")).strip()
    if not zone_val and state_val:
        auto_zone = _resolve_zone_for_state(state_val)
        if auto_zone:
            fields["zone_code"] = auto_zone

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
    email, phone, designation = _validate_authority_fields(
        email=str(fields.get("email", "")).strip().lower(),
        phone=str(fields.get("phone", "")).strip(),
        designation=str(fields.get("designation", "")).strip(),
    )
    authority, _created = OnboardingAuthority.objects.update_or_create(
        draft=draft,
        role=role,
        defaults={
            "full_name": str(fields.get("full_name", "")).strip(),
            "email": email,
            "phone": phone,
            "designation": designation,
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
    # DEC4 backstop: a slot saved before the contact rule still cannot submit.
    if not all(_authority_fields_satisfied(a) for a in roles.values()):
        return False
    return OnboardingUpload.objects.filter(draft=draft).exists()


# --- Submission (charter queue) -------------------------------------------
def submit_draft(draft: OnboardingDraft, request: Any = None) -> CharterApplication:
    """W1 gate + enqueue: ONE CharterApplication row (status=queued) + audit."""
    if not draft_is_complete(draft):
        # Name the ACTUAL blocker. A slot written before the DEC4 rule is not
        # an OTP problem, and telling the applicant to re-check codes that are
        # already correct sends them hunting for a fault that is not there.
        for saved in OnboardingAuthority.objects.filter(draft=draft):
            verdict = _authority_field_error(saved)
            if verdict is not None:
                raise verdict
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
