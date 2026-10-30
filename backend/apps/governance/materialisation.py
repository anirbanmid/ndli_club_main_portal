"""D2b: charter sanction -> club materialisation + auto registration certificate.

Owner decisions (``BRIEF_M6.md`` §6, 2026-10-24):

* On **sanction**, the submitted draft becomes REAL domain data:
  ``Institution`` + ``Club`` + ``AuthorityAssignment`` rows (the four tiers),
  with club-authority accounts provisioned/activated (``accounts`` RBAC).
* A ``CLUB_REGISTRATION`` certificate is auto-generated through the ONE
  signer (``certificates.signing``, P4) and deposited to the club admin side —
  visible wherever club-scoped certificates are served; no second cert path.

Design laws:

* **Idempotent** (P5): the ``CharterMaterialisation`` anchor row is checked
  first; re-running returns the same row and creates nothing new.
* **Nothing is fabricated** (C2 / spec §357): the zone is DERIVED from the
  state FK; an unknown ``state_code`` aborts with
  ``GovernanceError("unknown_state")`` before anything is written.
* **One transaction**: either the whole club exists (institution + club +
  assignments + certificate + audit) or none of it does.
* **Holder rule** (presentation only): the registration certificate is a
  club-level document; its holder is the most senior provisioned authority in
  tier order PATRON > PRESIDENT > SECRETARY > EXECUTIVE. Flip the priority
  map below if the owner prefers another presentation.
"""

from __future__ import annotations

import secrets
from datetime import date
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from ..accounts.models import AccountState, Category, SubRole
from ..audit import services as audit_services
from ..certificates.issue import issue_certificate
from ..certificates.models import Certificate, CertificateCategory
from ..domain.models import (
    AuthorityAssignment,
    Club,
    District,
    Institution,
    State,
)
from ..onboarding.models import (
    AuthorityRole,
    CharterApplication,
    OnboardingAuthority,
)
from .models import CharterMaterialisation
from .services import GovernanceError

#: Human-ambiguous alphabet for generated public codes (no 0/O/1/I).
_CODE_ALPHABET: str = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_BODY_LENGTH: int = 8

#: Authority tier -> accounts sub-role (the 4 spec tiers, 1:1).
_ROLE_TO_SUB_ROLE: dict[str, str] = {
    AuthorityRole.PATRON: SubRole.CLUB_PATRON,
    AuthorityRole.PRESIDENT: SubRole.CLUB_PRESIDENT,
    AuthorityRole.SECRETARY: SubRole.CLUB_SECRETARY,
    AuthorityRole.EXECUTIVE: SubRole.CLUB_EXECUTIVE,
}

#: Holder presentation priority (lower = more senior).
_TIER_PRIORITY: dict[str, int] = {
    AuthorityRole.PATRON: 0,
    AuthorityRole.PRESIDENT: 1,
    AuthorityRole.SECRETARY: 2,
    AuthorityRole.EXECUTIVE: 3,
}


def _unique_code(prefix: str, model: Any) -> str:
    """Draw ``PREFIX-XXXXXXXX`` codes until one is free (collision backstop)."""
    while True:
        body = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_BODY_LENGTH))
        code = f"{prefix}-{body}"
        if not model.objects.filter(code=code).exists():
            return code


def _unique_username(email: str) -> str:
    """Stable-ish username from the email local part, suffixed on collision."""
    base = "".join(ch for ch in email.split("@", 1)[0] if ch.isalnum() or ch == "_")
    base = base[:24] or "clubauthority"
    user_model = get_user_model()
    candidate = base
    n = 0
    while user_model.objects.filter(username=candidate).exists():
        n += 1
        candidate = f"{base}{n}"
    return candidate


def _provision_user(
    authority: OnboardingAuthority,
    *,
    institution: Institution,
    club: Club,
    state: State,
) -> Any:
    """Resolve the authority's account, provisioning it if the wizard never did.

    Lookup is by email (one person, one record). A missing account is created
    with an **unusable password** — access runs through the existing OTP path,
    never through a credential this service invents (P0). Accounts found or
    created are ACTIVE: the charter was just sanctioned.
    """
    user_model = get_user_model()
    user = (
        user_model.objects.filter(email__iexact=authority.email, is_active=True)
        .order_by("pk")
        .first()
    )
    if user is None:
        user = user_model.objects.create_user(
            username=_unique_username(authority.email),
            email=authority.email,
            password=None,  # unusable: OTP path owns credentials
            category=Category.CLUB_ADMIN,
            sub_role=_ROLE_TO_SUB_ROLE.get(authority.role, SubRole.CLUB_EXECUTIVE),
            institution_code=institution.code,
            club_code=club.code,
            state_code=state.code,
            zone_code=state.zone.code,
            phone=authority.phone,
            account_state=AccountState.ACTIVE,
        )
    return user


def _issue_registration_certificate(
    *,
    application: CharterApplication,
    club: Club,
    holder: Any,
    formation_date: date,
) -> Certificate:
    """Auto-generate + sign the registration certificate (collision-safe).

    Thin wrapper over the ONE issuer (``certificates.issue.issue_certificate``)
    so registration and renewal certificates can never diverge (P4).
    """
    return issue_certificate(
        holder=holder,
        club=club,
        category=CertificateCategory.CLUB_REGISTRATION,
        event_ref=f"registration-{club.code}",
        event_title=f"Club Registration — {club.name}",
        event_date=formation_date,
        issue_date=formation_date,
    )


@transaction.atomic
def materialise_charter(
    *,
    application: CharterApplication,
    request: Any = None,
) -> CharterMaterialisation:
    """Turn a sanctioned charter into a live club (idempotent, one transaction).

    Raises ``GovernanceError("not_sanctioned")`` when the application is not
    in the sanctioned state and ``GovernanceError("unknown_state")`` /
    ``GovernanceError("no_authorities")`` on structurally invalid submissions.
    """
    existing = (
        CharterMaterialisation.objects.filter(application=application)
        .select_related("institution", "club", "certificate")
        .first()
    )
    if existing is not None:
        return existing

    if application.status != CharterApplication.Status.SANCTIONED:
        raise GovernanceError("not_sanctioned")

    draft = application.draft
    authorities = list(OnboardingAuthority.objects.filter(draft=draft))
    if not authorities:
        raise GovernanceError("no_authorities")

    state = State.objects.filter(code=application.state_code).first()
    if state is None:
        raise GovernanceError("unknown_state")
    district = (
        District.objects.filter(state=state, code=application.district_code).first()
        if application.district_code
        else None
    )

    formation_date = (
        application.reviewed_at.date()
        if application.reviewed_at
        else timezone.now().date()
    )

    # A duplicate AISHE code would poison the certificate retry loop later;
    # fail fast here instead (nothing written yet at this point).
    aishe = draft.aishe_code or None
    if aishe and Institution.objects.filter(aishe_code=aishe).exists():
        raise GovernanceError("duplicate_aishe")

    institution = Institution.objects.create(
        code=_unique_code("INST", Institution),
        legacy_id=f"onb-{draft.id}"[:64],
        aishe_code=aishe,
        name=application.institution_name,
        state=state,
        district=district,
        status=Institution.Status.ACTIVE,
    )
    club = Club.objects.create(
        code=_unique_code("CLUB", Club),
        institution=institution,
        name=application.club_name,
        status=Club.Status.ACTIVE,
    )

    holder = None
    for authority in sorted(authorities, key=lambda a: _TIER_PRIORITY.get(a.role, 9)):
        user = _provision_user(
            authority, institution=institution, club=club, state=state
        )
        AuthorityAssignment.objects.create(
            user=user,
            club=club,
            tier=authority.role,
            from_date=formation_date,
            status=AuthorityAssignment.Status.ACTIVE,
        )
        if holder is None:
            holder = user

    certificate = _issue_registration_certificate(
        application=application,
        club=club,
        holder=holder,
        formation_date=formation_date,
    )

    materialisation = CharterMaterialisation.objects.create(
        application=application,
        institution=institution,
        club=club,
        certificate=certificate,
    )

    from apps.domain.integrity import LedgerIntegrityEngine

    acting_user = getattr(request, "user", None) if request else None
    target_officer = (
        acting_user
        if getattr(acting_user, "sub_role", None) == SubRole.REGIONAL_OFFICER
        else None
    )
    LedgerIntegrityEngine.ensure_club_approval_log(
        club,
        officer=target_officer,
        timestamp=formation_date,
        strict_gate=False,
    )

    audit_services.record(
        action="charter.materialised",
        outcome="success",
        object_type="charter_application",
        object_id=str(application.pk),
        request=request,
        detail={
            "institution_code": institution.code,
            "club_code": club.code,
            "certificate_id": certificate.certificate_id,
            "authorities": [str(a.pk) for a in authorities],
            "state_code": state.code,
            "zone_code": state.zone.code,
        },
    )
    return materialisation
