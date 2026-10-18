"""Identity lifecycle services (BRIEF_M1.md §2b F1–F5).

All business transitions happen here; views orchestrate, policies gate,
the audit decorator records. No SMS/phone delivery exists anywhere — the
F5 handover is manual and out-of-band by design (A7).
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any, cast

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import AbstractBaseUser, User
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import (
    AuthenticationFailed,
    PermissionDenied,
    Throttled,
    ValidationError,
)

from apps.audit.decorators import set_audit_detail

from . import conf
from .email_providers import EmailMessage, EmailProvider, get_email_provider
from .hashing import (
    generate_link_token,
    generate_otp_code,
    generate_password,
    hash_secret,
    verify_secret,
)
from .models import (
    AccountState,
    Category,
    ClubPasskey,
    EmailLinkToken,
    EmailOTP,
    Profile,
    SubRole,
    profile_of,
)
from .passwords import validate_password_strength
from .throttles import sliding_window_allow
from .totp import consume_recovery_code, verify_totp_code


def _audit(
    action: str,
    request: Any = None,
    *,
    actor: Any = None,
    outcome: str = "success",
    object_type: str = "",
    object_id: str = "",
    **detail: Any,
) -> None:
    """Record one lifecycle audit row (BRIEF_M1.md §5).

    The ``@audit_action`` decorator covers HTTP endpoints. These rows cover
    the F1–F5 transitions and the auth events the brief lists by name — they
    must be audited even when no view is involved (M1 ships no views yet).
    """
    from apps.audit import services as audit_services

    actor_id = getattr(actor, "pk", None) if actor is not None else None
    actor_label = actor.get_username() if actor is not None else ""
    audit_services.record(
        action=action,
        request=request,
        outcome=outcome,
        object_type=object_type,
        object_id=str(object_id),
        actor_id=int(actor_id) if actor_id is not None else None,
        actor_label=actor_label,
        detail=detail,
    )

# --- F1: provisional club account -----------------------------------------


def create_provisional_account(
    *,
    username: str,
    password: str,
    email: str,
    sub_role: str,
    institution_code: str,
    club_code: str,
    state_code: str = "",
    zone_code: str = "",
    phone: str = "",
    alt_phone: str = "",
    request: Any = None,
) -> AbstractBaseUser:
    """Create the provisional (``pending_approval``) club authority account."""
    from django.contrib.auth import get_user_model

    validate_password_strength(password)
    user_model = get_user_model()
    # F1: the club authority creates the ID *and* the password first, so the
    # credentials can resume the registration wizard. The password is set here
    # (never discarded) and stays provisional until the account is approved.
    user = user_model.objects.create_user(
        username=username, email=email, password=password
    )
    Profile.objects.create(
        user=user,
        category=Category.CLUB_ADMIN,
        sub_role=sub_role,
        institution_code=institution_code,
        club_code=club_code,
        state_code=state_code,
        zone_code=zone_code,
        phone=phone,
        alt_phone=alt_phone,
        account_state=AccountState.PENDING_APPROVAL,
    )
    _audit(
        "account.create",
        request,
        actor=user,
        object_type="account",
        object_id=username,
        category=Category.CLUB_ADMIN,
        sub_role=sub_role,
        account_state=AccountState.PENDING_APPROVAL,
    )
    return user


def club_login(
    *,
    username: str,
    password: str,
    request: Any,
) -> AbstractBaseUser:
    """Username + password login for the club/student faces.

    Provisional accounts cannot log in until approved (T7 pin); the account
    side of the F1 wizard resume is exposed to the M4 wizard only.
    """
    user = authenticate(request, username=username, password=password)
    if user is None:
        raise AuthenticationFailed("Invalid username or password.")
    profile = getattr(user, "profile", None)
    if profile is None or profile.category not in (
        Category.CLUB_ADMIN,
        Category.STUDENT_MEMBER,
    ):
        raise PermissionDenied("This account cannot use the club module.")
    if profile.account_state == AccountState.PENDING_APPROVAL:
        raise PermissionDenied(
            "Account is awaiting approval; you cannot log in yet.",
            code="approval_pending",
        )
    if profile.account_state != AccountState.ACTIVE:
        raise PermissionDenied("Account is not active.", code="account_inactive")
    _audit(
        "auth.login",
        request,
        actor=user,
        object_type="account",
        object_id=user.get_username(),
        module="club",
        method="password",
    )
    return user


def admin_login(
    *,
    username: str,
    password: str,
    code: str,
    request: Any,
) -> AbstractBaseUser:
    """Password + TOTP (or one-time recovery code) login for IIT Kgp Admin."""
    user = authenticate(request, username=username, password=password)
    if user is None:
        raise AuthenticationFailed("Invalid username or password.")
    profile = getattr(user, "profile", None)
    if profile is None or profile.category != Category.IIT_KGP_ADMIN:
        raise PermissionDenied("This account cannot use the admin module.")
    if profile.account_state != AccountState.ACTIVE:
        raise PermissionDenied("Account is not active.", code="account_inactive")
    if verify_totp_code(profile, code):
        set_audit_detail(request, second_factor="totp")
    elif consume_recovery_code(profile, code):
        set_audit_detail(request, second_factor="recovery_code")
    else:
        set_audit_detail(request, second_factor="failed")
        _audit(
            "auth.mfa_failed",
            request,
            actor=user,
            outcome="failure",
            object_type="account",
            object_id=user.get_username(),
        )
        raise AuthenticationFailed("Invalid second-factor code.")
    _audit(
        "auth.login",
        request,
        actor=user,
        object_type="account",
        object_id=user.get_username(),
        module="admin",
        method="password+totp",
    )
    return user


def record_login_failure(
    *,
    request: Any,
    username: str,
) -> tuple[bool, Profile | None]:
    """Apply the per-account lockout; returns (locked_now, profile)."""
    profile = Profile.objects.filter(user__username=username).first()
    if profile is None:
        return False, None
    profile.failed_login_count += 1
    locked_now = False
    if profile.failed_login_count >= conf.LOGIN_ACCOUNT_LIMIT:
        profile.locked_until = timezone.now() + timedelta(
            seconds=conf.LOGIN_LOCKOUT_SECONDS
        )
        profile.failed_login_count = 0
        locked_now = True
    profile.save(update_fields=["failed_login_count", "locked_until", "updated_at"])
    _audit(
        "auth.lockout" if locked_now else "auth.login_failure",
        request,
        outcome="denied" if locked_now else "failure",
        object_type="account",
        object_id=username,
        locked=locked_now,
    )
    return locked_now, profile


def clear_login_failures(profile: Profile) -> None:
    if profile.failed_login_count:
        profile.failed_login_count = 0
        profile.save(update_fields=["failed_login_count", "updated_at"])


# --- Email OTP: the verification component (BRIEF_M1.md §2a) --------------
#
# Email is the ONLY verification channel in this product. There is no SMS or
# voice path anywhere in the identity layer — the mobile numbers on the
# profile are human contact records for the F5 handover (A7), never a
# delivery channel. The code lives in the email body only: never a URL,
# never a response body, never an audit row (T1).


def _mask_email(email: str) -> str:
    """Traceable-but-not-PII recipient label for audit rows."""
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    head = local[:2]
    return f"{head}{'*' * max(len(local) - 2, 1)}@{domain}"


def send_email_otp(
    *,
    email: str,
    purpose: str = "email_verification",
    user: AbstractBaseUser | None = None,
    request: Any = None,
    provider: EmailProvider | None = None,
) -> EmailOTP:
    """Issue one 6-digit email-only OTP (single-use, 10 min, hashed at rest).

    Rate limit: ``conf.OTP_MAX_SENDS_PER_HOUR`` per recipient+purpose. The
    plaintext code is handed to the email provider and then dropped — only
    ``code_hash`` is persisted (T2).
    """
    if not email:
        raise ValidationError("An email address is required.")
    if not sliding_window_allow(
        f"otp:send:{purpose}:{email.lower()}",
        conf.OTP_MAX_SENDS_PER_HOUR,
        3600,
    ):
        set_audit_detail(request, otp_purpose=purpose, rate_limited=True)
        raise Throttled(
            detail="Too many verification codes requested. Try again later."
        )

    code = generate_otp_code()
    row = EmailOTP.objects.create(
        recipient_email=email,
        user=cast(User, user),
        purpose=purpose,
        code_hash=hash_secret(code),
        expires_at=timezone.now()
        + timedelta(seconds=conf.OTP_TTL_SECONDS),
    )
    (provider or get_email_provider()).send(
        EmailMessage(
            to=email,
            subject="Your NDLI Club verification code",
            body=(
                f"Your verification code is {code}.\n\n"
                f"It expires in {conf.OTP_TTL_SECONDS // 60} minutes and can "
                "be used once. Never share it — NDLI Club staff will never "
                "ask you for it.\n"
            ),
        )
    )
    set_audit_detail(
        request,
        otp_purpose=purpose,
        recipient=_mask_email(email),
        delivery_channel="email",
    )
    _audit(
        "email_otp.send",
        request,
        object_type="email_otp",
        object_id=purpose,
        delivery_channel="email",
    )
    return row


def verify_email_otp(
    *,
    email: str,
    code: str,
    purpose: str = "email_verification",
    request: Any = None,
) -> EmailOTP:
    """Consume one OTP: single-use, TTL-enforced, attempt-limited (T2).

    Five wrong attempts lock the code for ``conf.OTP_LOCKOUT_SECONDS``.
    Returns the consumed row; the code can never be replayed.
    """
    if not email or not code:
        raise ValidationError("An email address and code are required.")
    row = (
        EmailOTP.objects.filter(
            recipient_email=email, purpose=purpose, used_at__isnull=True
        )
        .order_by("-created_at")
        .first()
    )
    if row is None:
        raise ValidationError("That code is not valid.")
    if row.locked_until is not None and row.locked_until > timezone.now():
        set_audit_detail(request, otp_purpose=purpose, otp_locked=True)
        raise Throttled(detail="Too many attempts on this code. Try again later.")
    if row.expires_at <= timezone.now():
        set_audit_detail(request, otp_purpose=purpose, otp_expired=True)
        raise ValidationError("That code has expired.")

    if not verify_secret(code.strip(), row.code_hash):
        row.attempts += 1
        locked = False
        if row.attempts >= conf.OTP_MAX_VERIFY_ATTEMPTS:
            row.locked_until = timezone.now() + timedelta(
                seconds=conf.OTP_LOCKOUT_SECONDS
            )
            row.attempts = 0
            locked = True
        row.save(update_fields=["attempts", "locked_until"])
        set_audit_detail(request, otp_purpose=purpose, otp_locked=locked)
        _audit(
            "email_otp.lockout" if locked else "email_otp.verify",
            request,
            outcome="denied" if locked else "failure",
            object_type="email_otp",
            object_id=purpose,
            locked=locked,
        )
        raise ValidationError("That code is not valid.")

    row.used_at = timezone.now()
    row.save(update_fields=["used_at"])
    set_audit_detail(request, otp_purpose=purpose, otp_verified=True)
    _audit(
        "email_otp.verify",
        request,
        object_type="email_otp",
        object_id=purpose,
    )
    return row


# --- F3: permanent password -----------------------------------------------


def change_password(
    *,
    user: AbstractBaseUser,
    current_password: str,
    new_password: str,
) -> None:
    """Change the permanent password from inside a session (F3)."""
    if not user.check_password(current_password):
        raise ValidationError({"current_password": ["Current password is incorrect."]})
    if current_password == new_password:
        raise ValidationError(
            {"new_password": ["Choose a password you have not used."]}
        )
    validate_password_strength(new_password)
    user.set_password(new_password)
    user.save(update_fields=["password"])
    profile = getattr(user, "profile", None)
    if profile is not None and profile.must_change_password:
        profile.must_change_password = False
        if profile.account_state == AccountState.PENDING_APPROVAL:
            profile.account_state = AccountState.ACTIVE
        profile.save(
            update_fields=["must_change_password", "account_state", "updated_at"]
        )
    _audit(
        "password.change",
        actor=user,
        object_type="account",
        object_id=user.get_username(),
    )


# --- F2: approval + welcome link ------------------------------------------


def approve_club_account(
    *,
    target: AbstractBaseUser,
    actor: AbstractBaseUser,
) -> list[str]:
    """Approve a provisional club account; returns the notified emails.

    Scope rule (M1 stand-in for the M2 assignment table): the acting
    Regional Officer must belong to the same zone as the club account;
    Central Admin may approve any.
    """
    profile = profile_of(target)
    actor_profile = profile_of(actor)
    if profile.category != Category.CLUB_ADMIN:
        raise ValidationError("Only club authority accounts can be approved.")
    if profile.account_state != AccountState.PENDING_APPROVAL:
        raise ValidationError("Account is not pending approval.")
    if actor_profile.sub_role == SubRole.REGIONAL_OFFICER:
        if profile.zone_code != actor_profile.zone_code:
            raise PermissionDenied("This club is outside your zone.")
    with transaction.atomic():
        profile.account_state = AccountState.ACTIVE
        profile.must_change_password = True
        profile.save(
            update_fields=["account_state", "must_change_password", "updated_at"]
        )
        recipients = _send_welcome_links(profile)
    _audit(
        "account.approve",
        actor=actor,
        object_type="account",
        object_id=target.get_username(),
        notified=len(recipients),
        zone_code=profile.zone_code,
    )
    return recipients


def _send_welcome_links(profile: Profile) -> list[str]:
    """Welcome email + single-use 72h change-password link per authority."""
    provider = get_email_provider()
    recipients: list[str] = []
    authorities = Profile.objects.filter(
        category=Category.CLUB_ADMIN,
        institution_code=profile.institution_code,
        club_code=profile.club_code,
    ).select_related("user")
    for authority in authorities:
        email = authority.user.email
        if not email:
            continue
        token = _issue_link_token(
            authority, EmailLinkToken.Purpose.WELCOME_CHANGE_PASSWORD
        )
        provider.send(
            EmailMessage(
                to=email,
                subject="Your NDLI Club account is approved",
                body=(
                    "Welcome to the NDLI Club portal.\n\n"
                    "Your club account has been approved. Set your permanent "
                    "password within 72 hours using this single-use link:\n"
                    f"{_change_password_link(token)}\n\n"
                    "If you did not request this, contact your coordinator.\n"
                ),
            )
        )
        recipients.append(email)
    return recipients


def _change_password_link(token: str) -> str:
    # The token rides in the URL FRAGMENT: fragments never reach any server,
    # referrer or log line (docs/SECURITY.md, "No token in a URL").
    return f"{settings.SITE_URL}/account/change-password#token={token}"


def _reset_password_link(token: str) -> str:
    return f"{settings.SITE_URL}/account/reset-password#token={token}"


def _issue_link_token(profile: Profile, purpose: str) -> str:
    token = generate_link_token()
    ttl = (
        conf.WELCOME_TOKEN_TTL_SECONDS
        if purpose == EmailLinkToken.Purpose.WELCOME_CHANGE_PASSWORD
        else conf.RESET_TOKEN_TTL_SECONDS
    )
    EmailLinkToken.objects.create(
        user=profile.user,
        purpose=purpose,
        token_hash=hash_secret(token),
        expires_at=timezone.now() + timedelta(seconds=ttl),
    )
    return token


def use_link_token(*, token: str, purpose: str, new_password: str) -> AbstractBaseUser:
    """Consume a single-use F2/F4 link token and set the new password."""
    if not token or not new_password:
        raise ValidationError("Token and new password are required.")
    entry = (
        EmailLinkToken.objects.filter(
            purpose=purpose, token_hash=hash_secret(token), used_at__isnull=True
        )
        .select_related("user")
        .first()
    )
    if entry is None or entry.expires_at <= timezone.now():
        raise ValidationError("This link is invalid or has expired.")
    validate_password_strength(new_password)
    user = entry.user
    user.set_password(new_password)
    user.save(update_fields=["password"])
    entry.used_at = timezone.now()
    entry.save(update_fields=["used_at"])
    profile = user.profile
    if purpose == EmailLinkToken.Purpose.WELCOME_CHANGE_PASSWORD:
        profile.account_state = AccountState.ACTIVE
        profile.must_change_password = False
        profile.save(
            update_fields=["account_state", "must_change_password", "updated_at"]
        )
    else:
        profile.must_change_password = False
        profile.save(update_fields=["must_change_password", "updated_at"])
    _audit(
        "password.link_used",
        actor=user,
        object_type="account",
        object_id=user.get_username(),
        purpose=purpose,
    )
    return user


# --- F4: forgot password ---------------------------------------------------


def request_password_reset(
    *,
    email: str,
    provider: EmailProvider | None = None,
    request: Any = None,
) -> None:
    """Issue a single-use 30-minute reset link (F4).

    Rate-limited here as well as at the view (defence in depth — BRIEF_M1.md
    §2a requires the limit on the reset path, and M1 ships no view yet).
    Unknown addresses return silently: the response never confirms or denies
    that an account exists.
    """
    if email and not sliding_window_allow(
        f"reset:{email.lower()}",
        conf.RESET_REQUEST_LIMIT,
        conf.RESET_REQUEST_WINDOW_SECONDS,
    ):
        set_audit_detail(request, rate_limited=True, flow="forgot_password")
        raise Throttled(detail="Too many reset requests. Try again later.")
    user = (
        get_user_model()
        .objects.filter(email=email)
        .first()
    )
    if user is None:
        return  # generic response; never confirm/deny the address
    profile = getattr(user, "profile", None)
    if profile is None or profile.category not in (
        Category.CLUB_ADMIN,
        Category.STUDENT_MEMBER,
    ):
        return
    _audit(
        "password.reset_requested",
        request,
        object_type="account",
        object_id=getattr(user, "username", ""),
    )
    token = _issue_link_token(profile, EmailLinkToken.Purpose.FORGOT_PASSWORD)
    (provider or get_email_provider()).send(
        EmailMessage(
            to=email,
            subject="Reset your NDLI Club password",
            body=(
                "Use this single-use link within 30 minutes to set a new "
                "password:\n"
                f"{_reset_password_link(token)}\n\n"
                "If you did not request this, you can ignore this email.\n"
            ),
        )
    )


# --- F5: break-glass admin reset -------------------------------------------


def rotate_passkey(*, club_code: str) -> str:
    """Issue/rotate the per-club Official Institutional Passkey (A6)."""
    from .hashing import generate_passkey

    value = generate_passkey()
    ClubPasskey.objects.update_or_create(
        club_code=club_code,
        defaults={
            "passkey_hash": hash_secret(value),
            "rotated_at": timezone.now(),
            "is_active": True,
            "failed_attempts": 0,
            "locked_until": None,
        },
    )
    _audit(
        "passkey.rotate",
        object_type="club_passkey",
        object_id=club_code,
    )
    return value


def break_glass_reset(
    *,
    target: AbstractBaseUser,
    passkey: str,
    reason: str,
    request: Any,
) -> str:
    """F5: set a new one-time password, gated by the per-club passkey.

    The new password is returned once to the admin (shown on screen) and
    handed over MANUALLY; the account is flagged ``must_change_password``.
    Wrong passkey → 403 + audited + counted toward the passkey lockout.
    The email channel is never touched.
    """
    profile = profile_of(target)
    if profile.category != Category.CLUB_ADMIN:
        raise PermissionDenied("Only club accounts support break-glass reset.")
    entry = ClubPasskey.objects.filter(
        club_code=profile.club_code, is_active=True
    ).first()
    if entry is None:
        set_audit_detail(request, passkey_used=False, reason=reason)
        _audit(
            "auth.break_glass",
            request,
            actor=target,
            outcome="denied",
            object_type="account",
            object_id=target.get_username(),
            passkey_used=False,
            reason=reason,
        )
        raise PermissionDenied("No Official Institutional Passkey on record.")
    if entry.locked_until is not None and entry.locked_until > timezone.now():
        set_audit_detail(
            request, passkey_used=False, reason=reason, passkey_locked=True
        )
        _audit(
            "auth.break_glass",
            request,
            actor=target,
            outcome="denied",
            object_type="account",
            object_id=target.get_username(),
            passkey_used=False,
            passkey_locked=True,
            reason=reason,
        )
        raise PermissionDenied("Passkey is temporarily locked.")
    if not verify_secret(passkey, entry.passkey_hash):
        entry.failed_attempts += 1
        locked = False
        if entry.failed_attempts >= conf.PASSKEY_MAX_FAILURES:
            entry.locked_until = timezone.now() + timedelta(
                seconds=conf.PASSKEY_LOCKOUT_SECONDS
            )
            entry.failed_attempts = 0
            locked = True
        entry.save(update_fields=["failed_attempts", "locked_until"])
        set_audit_detail(
            request,
            passkey_used=False,
            reason=reason,
            passkey_locked=locked,
            target=target.get_username(),
        )
        _audit(
            "auth.break_glass",
            request,
            actor=target,
            outcome="denied",
            object_type="account",
            object_id=target.get_username(),
            passkey_used=False,
            passkey_locked=locked,
            reason=reason,
        )
        raise PermissionDenied("Official Institutional Passkey rejected.")
    entry.failed_attempts = 0
    entry.save(update_fields=["failed_attempts"])
    new_password = generate_password()
    target.set_password(new_password)
    target.save(update_fields=["password"])
    profile.must_change_password = True
    if profile.account_state == AccountState.PENDING_APPROVAL:
        profile.account_state = AccountState.ACTIVE
    profile.save(update_fields=["must_change_password", "account_state", "updated_at"])
    set_audit_detail(
        request,
        passkey_used=True,
        reason=reason,
        target=target.get_username(),
        must_change_password=True,
    )
    _audit(
        "auth.break_glass",
        request,
        actor=target,
        object_type="account",
        object_id=target.get_username(),
        passkey_used=True,
        must_change_password=True,
        reason=reason,
    )
    return new_password
