"""
apps.data_admin.services - the red-zone wipe itself.

Faithful port of the legacy ``SyncEngine.hard_reset_for_handover()``
(``db/sync/maintenance.py``) and ``routes/data_admin.py``, adapted from the CSV
world to the Django schema.

LEGACY SEMANTICS (preserved exactly):
  * The provisioned skeleton survives: master users + every officer's login
    credentials. The client keeps these and changes passwords later.
  * Everything else is wiped. No reseed of any kind: no test clubs, no quotas.
    The old ``reset_all_and_reseed`` ("Reset Test Data") semantics are gone on
    purpose - the system must be blank and ready for the client.
  * Never destroy without a net: the caller MUST have taken a checkpoint first
    and MUST abort if that checkpoint failed.

PORT JUDGMENT CALLS (flagged for owner sign-off - see JUDGMENT below):
  * ``AuditLog`` is RETAINED. It is append-only and hash-chained, and the reset
    action has to be recorded in it. Retaining it also keeps the compliance
    trail of the handover itself. If the owner wants a blank trail too, flip
    ``WIPE_AUDIT_LOG`` to ``True``.
  * Robu's assistant logs (legacy ``assistant_interactions`` / ``_preferences``
    / ``_feedback``) have no Django counterpart yet, so there is nothing to
    wipe; the wipe is a no-op for them rather than a fabricated deletion.
"""
from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction

from apps.accounts.models import (
    ClubPasskey,
    EmailLinkToken,
    EmailOTP,
    TOTPRecoveryCode,
)
from apps.audit.models import AuditLog
from apps.certificates.models import Certificate, Revocation
from apps.clubs.models import CampusPasskey, ClubShowcase, ShowcaseSection
from apps.domain.models import (
    AuthorityAssignment,
    Club,
    District,
    Institution,
    Membership,
    OfficerAssignment,
    State,
    Zone,
)
from apps.governance.models import CharterMaterialisation, RenewalRecord
from apps.grievances.models import GrievanceTicket, SLAEvent
from apps.members.models import JoinRequest, RosterEntry, RosterImportJob
from apps.onboarding.models import (
    CharterApplication,
    OnboardingAuthority,
    OnboardingDraft,
    OnboardingUpload,
)

#: Flip to True only on explicit owner instruction: wipes the audit trail too.
WIPE_AUDIT_LOG = False

#: The provisioned skeleton. NEVER wiped - the client keeps these and rotates
#: the credentials themselves after handover. Mirrors legacy ``master_users.csv``
#: plus every node's ``credentials.csv``.
KEEP_MODELS: tuple[Any, ...] = (
    get_user_model(),
    ClubPasskey,
    TOTPRecoveryCode,
    EmailOTP,
    EmailLinkToken,
    Zone,
    State,
    District,
    Institution,
)

#: The destroy set. Ordered children-before-parents so no FK is left dangling.
#: ``AuditLog`` is deliberately absent unless ``WIPE_AUDIT_LOG`` is set.
WIPE_MODELS: tuple[Any, ...] = (
    # certificates
    Revocation,
    Certificate,
    # governance
    RenewalRecord,
    CharterMaterialisation,
    # grievances
    SLAEvent,
    GrievanceTicket,
    # members
    RosterImportJob,
    RosterEntry,
    JoinRequest,
    # onboarding
    OnboardingUpload,
    OnboardingAuthority,
    CharterApplication,
    OnboardingDraft,
    # clubs (showcase + campus credentials)
    CampusPasskey,
    ShowcaseSection,
    ClubShowcase,
    # domain business objects (parents last)
    OfficerAssignment,
    AuthorityAssignment,
    Membership,
    Club,
)


class ResetError(Exception):
    """Typed failure carrying the HTTP-facing reason code."""

    def __init__(self, code: str, message: str, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.message = message
        self.status_code = status_code


def _label(model: Any) -> str:
    return f"{model._meta.app_label}.{model._meta.model_name}"


def wipe_manifest() -> list[dict[str, Any]]:
    """The exact destroy list, as reviewable data (used by tests + the API)."""
    models = list(WIPE_MODELS)
    if WIPE_AUDIT_LOG:
        models.append(AuditLog)
    return [
        {"model": _label(m), "objects": m.objects.count()} for m in models
    ]


def hard_reset_for_handover(*, actor_label: str = "") -> dict[str, Any]:
    """
    Wipe all application data down to a blank-but-provisioned state.

    MUST only be called once the caller has (a) verified the triple-layer guard
    and (b) successfully written a pre-reset safety checkpoint. There is
    deliberately no reseed.

    Returns the legacy-shaped result dict so the response payload stays stable:
    ``accounts_kept`` / ``nodes_wiped`` / ``history_wiped`` /
    ``assistant_logs_wiped``.
    """
    user_model = get_user_model()
    accounts_kept = user_model.objects.count()

    wiped: dict[str, int] = {}
    with transaction.atomic():
        for model in WIPE_MODELS:
            count, _ = model.objects.all().delete()
            wiped[_label(model)] = count
        if WIPE_AUDIT_LOG:
            count, _ = AuditLog.objects.all().delete()
            wiped[_label(AuditLog)] = count

    total_wiped = sum(wiped.values())

    # Legacy parity fields: the CSV world reported node wipes + history wipes.
    # In the schema world these roll up into the single transactional wipe, so
    # they are reported truthfully rather than invented.
    return {
        "accounts_kept": accounts_kept,
        "nodes_wiped": total_wiped,
        "history_wiped": WIPE_AUDIT_LOG,
        "assistant_logs_wiped": 0,
        "rows_wiped": total_wiped,
        "wiped": wiped,
        "accounts_kept_label": actor_label,
    }
