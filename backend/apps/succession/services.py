"""Succession workflow — dual-control club-authority handover (M2-A3).

Owner-approved rules implemented HERE (Batch 2, 2026-11); views stay thin:

* **Conflict check at submission** — the proposed email's ACTIVE
  ``AuthorityAssignment`` posts anywhere OUTSIDE the target post are
  snapshotted onto the request and must be explicitly confirmed
  (``confirm_conflict``). The snapshot travels with the request so the
  approving IIT Kgp employee re-verifies exactly what was asked.
* **Who decides** (``authorize_decision``): PATRON / PRESIDENT / SECRETARY
  posts are decided by the IIT Kgp employee CURRENTLY assigned to the club's
  State — duty is read live via ``core.scoping.assigned_states``
  (``domain.OfficerAssignment``), never stamped. EXECUTIVE posts are decided
  inside the club by ANOTHER Main Admin (no escalation to an officer). The
  requester never decides their own request (two-person rule). Central Admin
  is oversight-only: it reads the whole desk, it never decides. Super Admin
  (ops house) sees no business data at all — consistent with every
  ``core.scoping`` helper (§3b).
* **Approval executes atomically** (one transaction): conflicts confirmed at
  submission are ENDED via ``onboarding.services.deactivate_authority_account``,
  the incumbent post is ENDED, the account is provisioned or converted, and
  the new ``AuthorityAssignment`` goes ACTIVE. A conflict that appeared only
  AFTER submission blocks the approval (``conflict_changed``, 409) until the
  request is sent back for reverification.
* **Credentials are sacred**: an EXISTING account keeps its password and its
  ``must_change_password`` flag untouched (no SMTP on prod — nothing may be
  rotated silently). Only a genuinely NEW account receives a one-time temp
  password (``must_change_password=True``), coordinator-style.
* Every state change appends exactly one AuditLog row (``audit.services``).
"""

from __future__ import annotations

import re
import secrets
from typing import Any

from django.core.exceptions import ObjectDoesNotExist
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import (
    MAIN_CLUB_ADMIN_SUB_ROLES,
    AccountState,
    Category,
    SubRole,
    User,
)
from apps.accounts.passwords import validate_password_strength
from apps.audit import services as audit_services
from apps.core.scoping import assigned_states
from apps.domain.models import AuthorityAssignment, Club
from apps.onboarding.services import deactivate_authority_account

from .models import SuccessionRequest


class SuccessionError(Exception):
    """Domain error: machine code + HTTP status (+ optional extra payload)."""

    def __init__(
        self,
        message: str,
        *,
        code: str,
        http_status: int = 400,
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.http_status = http_status
        self.extra: dict[str, Any] = extra or {}


#: Decisions accepted by the decide endpoints (body field: ``decision``).
DECISION_APPROVE = "approve"
DECISION_REJECT = "reject"
DECISIONS = frozenset({DECISION_APPROVE, DECISION_REJECT})

#: Sub-roles that read the WHOLE desk but never decide (oversight).
_CENTRAL_SUB_ROLES = frozenset({SubRole.CENTRAL_ADMIN, SubRole.SUPER_ADMIN_OPS})

#: Tier spellings the club UI may send. Canonical storage is ALWAYS the
#: ``AuthorityAssignment.Tier`` value ("patron"/"president"/"secretary"/
#: "executive"); Title-case input normalizes via ``str.lower()`` below.
_TIER_ALIASES: dict[str, str] = {
    "executive member": "executive",
}

#: Tier -> accounts sub-role (mirrors governance.materialisation's role map,
#: keyed by PLAIN strings so DB values never depend on enum hashing).
_TIER_TO_SUB_ROLE: dict[str, str] = {
    "patron": SubRole.CLUB_PATRON,
    "president": SubRole.CLUB_PRESIDENT,
    "secretary": SubRole.CLUB_SECRETARY,
    "executive": SubRole.CLUB_EXECUTIVE,
}


# ---------------------------------------------------------------------------
# Small shared readers (soft-FK safe: a missing domain row is None, never a
# DoesNotExist crash — the ``_linked_club`` lesson from Batch 1).
# ---------------------------------------------------------------------------


def _linked_club(user: Any) -> Club | None:
    """Club linked to ``user``, or ``None`` — never raises.

    ``User.club`` is an FK(default="", null=False, to_field="code",
    db_constraint=False): a clubless user has ``club_id=""``, so the
    descriptor query misses and raises ``Club.DoesNotExist``.
    """
    if user is None:
        return None
    try:
        return user.club
    except Club.DoesNotExist:
        return None


def _institution_of(club: Any) -> Any:
    try:
        return club.institution
    except ObjectDoesNotExist:
        return None


def _state_of(institution: Any) -> Any:
    if institution is None:
        return None
    try:
        return institution.state
    except ObjectDoesNotExist:
        return None


def _zone_of(state: Any) -> Any:
    if state is None:
        return None
    try:
        return state.zone
    except ObjectDoesNotExist:
        return None


def _state_code_of(club: Any) -> str:
    state = _state_of(_institution_of(club))
    return str(getattr(state, "code", "") or "")


# ---------------------------------------------------------------------------
# Conflict check
# ---------------------------------------------------------------------------


def conflicts_for(*, email: str, tier: str, club: Club) -> list[dict[str, Any]]:
    """ACTIVE posts the proposed email holds OUTSIDE the target post.

    This list IS the conflict info shown to the approver (it rides along in
    the request payload). The target post itself is never a conflict.
    """
    rows = (
        AuthorityAssignment.objects.select_related("club__institution__state")
        .filter(user__email__iexact=email, status=AuthorityAssignment.Status.ACTIVE)
        .exclude(club=club, tier=tier)
    )
    conflicts: list[dict[str, Any]] = []
    for row in rows:
        institution = _institution_of(row.club)
        state = _state_of(institution)
        conflicts.append(
            {
                "tier": row.tier,
                "club_code": row.club.code,
                "club_name": row.club.name,
                "institution_name": str(getattr(institution, "name", "") or ""),
                "state_code": str(getattr(state, "code", "") or ""),
                "from_date": row.from_date.isoformat(),
            }
        )
    return conflicts


def _conflict_keys(rows: Any) -> frozenset[tuple[str, str]]:
    """Identity of a conflict list: (club_code, tier) pairs."""
    return frozenset(
        (str(row.get("club_code", "")), str(row.get("tier", ""))) for row in rows
    )


# ---------------------------------------------------------------------------
# Scoped querysets (the two doors)
# ---------------------------------------------------------------------------


def club_requests_for(user: Any) -> Any:
    """The caller's own-club rows; a clubless account sees an honest empty desk."""
    club = _linked_club(user)
    if club is None:
        return SuccessionRequest.objects.none()
    return (
        SuccessionRequest.objects.select_related(
            "club__institution__state", "submitted_by", "decided_by"
        )
        .filter(club=club)
        .order_by("-created_at")
    )


def desk_for(user: Any) -> Any:
    """Employee desk rows for ``user`` (queryset-level scoping, P0).

    * **Central Admin**: every request (oversight — read only;
      ``authorize_decision`` refuses it at decision time).
    * **Super Admin (ops)**: nothing — the ops house holds zero business
      data, exactly like every ``core.scoping`` helper.
    * **Regional officer**: only clubs in their CURRENT duty States, and only
      the tiers an officer decides (executive is an in-club decision, so
      those rows never land on this desk).
    * Anyone else: nothing (deny by default — the view gate also refuses).
    """
    qs = (
        SuccessionRequest.objects.select_related(
            "club__institution__state", "submitted_by", "decided_by"
        )
        .order_by("-created_at")
    )
    sub_role = str(getattr(user, "sub_role", "") or "")
    if sub_role == SubRole.CENTRAL_ADMIN:
        return qs
    if sub_role == SubRole.REGIONAL_OFFICER:
        states = assigned_states(user)
        if not states:
            return qs.none()
        return qs.filter(
            club__institution__state__code__in=sorted(states)
        ).exclude(tier="executive")
    return qs.none()


# ---------------------------------------------------------------------------
# Submission
# ---------------------------------------------------------------------------


def ensure_main_admin(user: Any) -> None:
    """Only the club's Main Admins (Patron / President / Secretary) may propose."""
    if (
        getattr(user, "category", None) != Category.CLUB_ADMIN
        or getattr(user, "sub_role", None) not in MAIN_CLUB_ADMIN_SUB_ROLES
    ):
        raise SuccessionError(
            "Only the club's Main Admins (Patron, President, Secretary) may "
            "propose a succession.",
            code="not_main_admin",
            http_status=403,
        )


@transaction.atomic
def submit_request(
    *,
    user: Any,
    tier: Any,
    name: Any,
    email: Any,
    reason: Any,
    phone: Any = "",
    confirmed: bool = False,
    request: Any = None,
) -> SuccessionRequest:
    """Intake: validate, snapshot the conflicts, demand their confirmation.

    The club ALWAYS comes from the caller's own record — a body field cannot
    aim a request at another club (mass-assignment guard).
    """
    ensure_main_admin(user)
    club = _linked_club(user)
    if club is None:
        raise SuccessionError(
            "No club is linked to this account.", code="no_linked_club"
        )

    raw_tier = str(tier or "").strip().lower()
    tier_code = _TIER_ALIASES.get(raw_tier, raw_tier)
    if tier_code not in AuthorityAssignment.Tier.values:
        raise SuccessionError("Unknown succession tier.", code="invalid_tier")

    clean_name = str(name or "").strip()[:150]
    clean_email = str(email or "").strip().lower()
    clean_reason = str(reason or "").strip()
    clean_phone = str(phone or "").strip()[:32]
    if not clean_name or not clean_email or not clean_reason:
        raise SuccessionError(
            "Name, email and reason are required.", code="missing_fields"
        )
    try:
        validate_email(clean_email)
    except DjangoValidationError:
        raise SuccessionError(
            "Enter a valid email address for the proposed authority.",
            code="invalid_email",
        ) from None

    if AuthorityAssignment.objects.filter(
        club=club,
        tier=tier_code,
        status=AuthorityAssignment.Status.ACTIVE,
        user__email__iexact=clean_email,
    ).exists():
        raise SuccessionError(
            "This email already holds the post being handed over.",
            code="proposed_is_incumbent",
        )

    if User.objects.filter(
        email__iexact=clean_email, category=Category.IIT_KGP_ADMIN
    ).exists():
        raise SuccessionError(
            "This email belongs to an IIT Kharagpur module account and cannot "
            "be re-pointed to a club post.",
            code="proposed_is_employee_account",
        )

    conflicts = conflicts_for(email=clean_email, tier=tier_code, club=club)
    if conflicts and not confirmed:
        raise SuccessionError(
            "The proposed authority already holds active posts elsewhere — "
            "confirm the handover to submit.",
            code="conflict_confirmation_required",
            http_status=409,
            extra={"conflicts": conflicts},
        )

    if SuccessionRequest.objects.filter(
        club=club, tier=tier_code, status=SuccessionRequest.Status.PENDING
    ).exists():
        raise SuccessionError(
            "A pending request already exists for this post — decide it first.",
            code="pending_exists",
            http_status=409,
        )

    try:
        with transaction.atomic():
            req = SuccessionRequest.objects.create(
                club=club,
                tier=tier_code,
                proposed_name=clean_name,
                proposed_email=clean_email,
                proposed_phone=clean_phone,
                reason=clean_reason[:2000],
                conflict_snapshot=conflicts,
                conflicts_confirmed=bool(conflicts),
                submitted_by=user,
            )
    except IntegrityError:
        # The partial unique constraint is the real arbiter under a race.
        raise SuccessionError(
            "A pending request already exists for this post — decide it first.",
            code="pending_exists",
            http_status=409,
        ) from None

    audit_services.record(
        action="succession.submitted",
        object_type="succession_request",
        object_id=str(req.pk),
        request=request,
        detail={
            "tier": tier_code,
            "club_code": club.code,
            "proposed_email": clean_email,
            "conflicts": len(conflicts),
        },
    )
    return req


# ---------------------------------------------------------------------------
# Who may decide
# ---------------------------------------------------------------------------


def authorize_decision(*, user: Any, req: SuccessionRequest) -> None:
    """The dual-control rules — raise ``SuccessionError`` when the caller may not.

    Two-person rule first (the requester never decides their own request),
    then the tier split: executive = in-club other Main Admin; the rest =
    the officer on duty for the club's State. Central/Super Admin are
    oversight-only and are refused here even though they can READ the desk.
    """
    if req.submitted_by_id and getattr(user, "pk", None) == req.submitted_by_id:
        raise SuccessionError(
            "The requesting account cannot decide its own succession request.",
            code="same_person_forbidden",
            http_status=403,
        )

    category = getattr(user, "category", None)
    sub_role = str(getattr(user, "sub_role", "") or "")

    if req.tier == "executive":
        if category == Category.IIT_KGP_ADMIN:
            raise SuccessionError(
                "Executive-tier succession is decided inside the club by the "
                "other Main Admins — employees hold oversight only.",
                code="oversight_only",
                http_status=403,
            )
        if category != Category.CLUB_ADMIN or sub_role not in (
            MAIN_CLUB_ADMIN_SUB_ROLES
        ):
            raise SuccessionError(
                "Executive-tier succession is decided inside the club by the "
                "other Main Admins.",
                code="in_club_approval_required",
                http_status=403,
            )
        # NOTE: ``User.club`` is an FK(to_field="code") while
        # ``SuccessionRequest.club`` targets the row pk — compare the Club
        # ROWS, never the raw id attributes (they are different spaces).
        linked = _linked_club(user)
        if linked is None or linked.pk != req.club.pk:
            raise SuccessionError(
                "Only a Main Admin of this club may decide this request.",
                code="not_club_main_admin",
                http_status=403,
            )
        return

    if category != Category.IIT_KGP_ADMIN:
        raise SuccessionError(
            "This post is decided by the IIT Kharagpur officer on duty for "
            "the club's State.",
            code="employee_approval_required",
            http_status=403,
        )
    if sub_role != SubRole.REGIONAL_OFFICER:
        raise SuccessionError(
            "Central Admin is oversight-only on succession — the officer on "
            "duty decides.",
            code="oversight_only",
            http_status=403,
        )
    if _state_code_of(req.club) not in assigned_states(user):
        raise SuccessionError(
            "You are not the officer currently assigned to this club's State.",
            code="not_the_assigned_officer",
            http_status=403,
        )


# ---------------------------------------------------------------------------
# Provisioning (coordinator-style; existing passwords NEVER touched)
# ---------------------------------------------------------------------------


def _unique_username(email: str) -> str:
    """A free username derived from the email local part (never colliding)."""
    base = re.sub(r"[^a-zA-Z0-9_]", "_", email.split("@")[0]) or "authority"
    base = base[:130]
    username = base
    counter = 1
    while User.objects.filter(username__iexact=username).exists():
        username = f"{base}_{counter}"
        counter += 1
    return username


def _provision_authority(
    *, req: SuccessionRequest, club: Club
) -> tuple[Any, str]:
    """Find/create the proposed holder's account and re-point it at ``club``.

    Returns ``(account, temporary_password)`` — the password is NON-EMPTY only
    for a brand-new account. Existing accounts keep their password and their
    ``must_change_password`` flag exactly as they are (owner decision: no
    SMTP on prod, so credentials may never be rotated silently).
    """
    email = req.proposed_email
    sub_role = _TIER_TO_SUB_ROLE.get(str(req.tier))
    if sub_role is None:
        raise SuccessionError("Unknown succession tier.", code="invalid_tier")

    institution = _institution_of(club)
    state = _state_of(institution)
    zone = _zone_of(state)
    # A scope FK answers None when the domain row is missing: omit it so the
    # field default ("") applies — never insert NULL into a NOT NULL column.
    scope_kwargs: dict[str, Any] = {}
    if institution is not None:
        scope_kwargs["institution"] = institution
    if state is not None:
        scope_kwargs["state"] = state
    if zone is not None:
        scope_kwargs["zone"] = zone

    holder = User.objects.filter(email__iexact=email).order_by("pk").first()
    if holder is None:
        temporary_password = f"AuthorityPass@{secrets.token_hex(3)}2026!"
        validate_password_strength(temporary_password)
        created = User.objects.create_user(
            username=_unique_username(email),
            email=email,
            password=temporary_password,
            first_name=req.proposed_name[:150] or "Authority",
            category=Category.CLUB_ADMIN,
            sub_role=sub_role,
            account_state=AccountState.ACTIVE,
            is_active=True,
            must_change_password=True,
            club=club,
            phone=req.proposed_phone,
            **scope_kwargs,
        )
        return created, temporary_password

    if str(getattr(holder, "category", "")) == Category.IIT_KGP_ADMIN:
        # Race guard inside the transaction: a module account may never be
        # re-pointed to a club post (P0).
        raise SuccessionError(
            "This email belongs to an IIT Kharagpur module account and cannot "
            "be re-pointed to a club post.",
            code="proposed_is_employee_account",
        )
    holder.category = Category.CLUB_ADMIN
    holder.sub_role = sub_role
    holder.account_state = AccountState.ACTIVE
    holder.is_active = True
    # Existing credentials and must_change_password stay untouched.
    holder.club = club
    if institution is not None:
        holder.institution = institution
    if state is not None:
        holder.state = state
    if zone is not None:
        holder.zone = zone
    if req.proposed_name:
        holder.first_name = req.proposed_name[:150]
    if req.proposed_phone:
        holder.phone = req.proposed_phone
    holder.save()
    return holder, ""


# ---------------------------------------------------------------------------
# The decision
# ---------------------------------------------------------------------------


def _approve(
    req: SuccessionRequest, *, user: Any, note: str, request: Any
) -> tuple[SuccessionRequest, dict[str, Any]]:
    """The atomic swap: end conflicts + incumbent, provision, activate, stamp."""
    club = Club.objects.select_related("institution__state__zone").get(pk=req.club_id)

    # (1) Conflicts that appeared only AFTER submission block the approval —
    #     the requester must re-confirm and the employee re-verify (409).
    live = conflicts_for(email=req.proposed_email, tier=req.tier, club=club)
    new_keys = _conflict_keys(live) - _conflict_keys(req.conflict_snapshot or [])
    if new_keys:
        raise SuccessionError(
            "The proposed authority's active posts changed since submission — "
            "send it back for reverification.",
            code="conflict_changed",
            http_status=409,
            extra={"conflicts": live},
        )
    if AuthorityAssignment.objects.filter(
        club=club,
        tier=req.tier,
        status=AuthorityAssignment.Status.ACTIVE,
        user__email__iexact=req.proposed_email,
    ).exists():
        raise SuccessionError(
            "This email already holds the post being handed over.",
            code="proposed_is_incumbent",
        )

    # (2) End every OTHER active post of the proposed email (the confirmed
    #     handover), then the incumbent of THIS post.
    deactivation = deactivate_authority_account(req.proposed_email)
    ended_elsewhere = bool(deactivation.get("success"))

    incumbent = AuthorityAssignment.objects.filter(
        club=club, tier=req.tier, status=AuthorityAssignment.Status.ACTIVE
    ).first()
    ended_incumbent = incumbent is not None
    if incumbent is not None:
        incumbent.status = AuthorityAssignment.Status.ENDED
        incumbent.to_date = timezone.now().date()
        incumbent.save(update_fields=["status", "to_date", "updated_at"])

    # (3) The account — existing passwords preserved (see module docstring).
    holder, temporary_password = _provision_authority(req=req, club=club)

    # (4) The new appointment, live from today.
    AuthorityAssignment.objects.create(
        user=holder,
        club=club,
        tier=req.tier,
        from_date=timezone.now().date(),
        status=AuthorityAssignment.Status.ACTIVE,
    )

    # (5) Stamp the decision.
    req.status = SuccessionRequest.Status.APPROVED
    req.decided_by = user
    req.decided_at = timezone.now()
    req.decision_note = note.strip()[:500]
    req.save(
        update_fields=[
            "status",
            "decided_by",
            "decided_at",
            "decision_note",
            "updated_at",
        ]
    )

    audit_services.record(
        action="succession.approved",
        object_type="succession_request",
        object_id=str(req.pk),
        request=request,
        detail={
            "tier": req.tier,
            "club_code": club.code,
            "proposed_email": req.proposed_email,
            "ended_incumbent": ended_incumbent,
            "ended_elsewhere": ended_elsewhere,
            "account_created": bool(temporary_password),
        },
    )
    result: dict[str, Any] = {"account_created": bool(temporary_password)}
    if temporary_password:
        result["temporary_password"] = temporary_password
    return req, result


@transaction.atomic
def _decide(
    *,
    pk: Any,
    user: Any,
    decision: Any,
    note: Any,
    candidates: Any,
    request: Any = None,
) -> tuple[SuccessionRequest, dict[str, Any]]:
    """One decision path for both doors (scope -> lock -> authorize -> act).

    * ``candidates`` is the caller's scoped queryset: an out-of-scope ID looks
      exactly like a missing one (404, never data).
    * The row lock is taken WITHOUT joins — Postgres rejects ``FOR UPDATE``
      on the nullable side of an outer join, and every failure path raises
      (the transaction rolls back, releasing the lock).
    """
    code = str(decision or "").strip().lower()
    if code not in DECISIONS:
        raise SuccessionError(
            "decision must be 'approve' or 'reject'.", code="invalid_decision"
        )

    locked = (
        SuccessionRequest.objects.select_for_update()
        .only("pk", "status")
        .filter(pk=pk)
        .first()
    )
    if locked is None or not candidates.filter(pk=locked.pk).exists():
        raise SuccessionError("Not found.", code="not_found", http_status=404)

    req = candidates.filter(pk=locked.pk).first()
    if req is None:
        raise SuccessionError("Not found.", code="not_found", http_status=404)
    if req.status != SuccessionRequest.Status.PENDING:
        raise SuccessionError(
            "This request has already been decided.",
            code="already_decided",
            http_status=409,
        )

    authorize_decision(user=user, req=req)

    if code == DECISION_REJECT:
        req.status = SuccessionRequest.Status.REJECTED
        req.decided_by = user
        req.decided_at = timezone.now()
        req.decision_note = str(note or "").strip()[:500]
        req.save(
            update_fields=[
                "status",
                "decided_by",
                "decided_at",
                "decision_note",
                "updated_at",
            ]
        )
        audit_services.record(
            action="succession.rejected",
            object_type="succession_request",
            object_id=str(req.pk),
            request=request,
            detail={
                "tier": req.tier,
                "club_code": req.club.code,
                "note": req.decision_note,
            },
        )
        return req, {}
    return _approve(req, user=user, note=str(note or ""), request=request)


def decide_in_club(
    *,
    pk: Any,
    user: Any,
    decision: Any,
    note: Any = "",
    request: Any = None,
) -> tuple[SuccessionRequest, dict[str, Any]]:
    """Club-door decision (own club only; executive tier passes the gate)."""
    return _decide(
        pk=pk,
        user=user,
        decision=decision,
        note=note,
        candidates=club_requests_for(user),
        request=request,
    )


def decide_at_desk(
    *,
    pk: Any,
    user: Any,
    decision: Any,
    note: Any = "",
    request: Any = None,
) -> tuple[SuccessionRequest, dict[str, Any]]:
    """Employee-desk decision (duty-scoped rows; central reads, officers act)."""
    return _decide(
        pk=pk,
        user=user,
        decision=decision,
        note=note,
        candidates=desk_for(user),
        request=request,
    )
