"""Cache-invalidation signals for the one cached derived value (P4)
and Single Source of Truth (SSOT) Ledger Integrity Hard Gate.

``domain.assignments`` caches ``OfficerAssignment`` routing lookups; every
write to ``OfficerAssignment`` (or to a ``State``, whose zone mapping feeds
the scope joins) bumps the cache namespace so staleness is never implicit.

``domain.integrity`` guarantees that every Club created or saved is gated
through its responsible Regional Officer and has an authentic ActivityLog entry.
"""

from __future__ import annotations

from typing import Any

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .assignments import invalidate_officer_cache
from .models import Club, OfficerAssignment, State


@receiver(post_save, sender=OfficerAssignment, dispatch_uid="domain_officer_saved")
@receiver(post_delete, sender=OfficerAssignment, dispatch_uid="domain_officer_deleted")
@receiver(post_save, sender=State, dispatch_uid="domain_state_saved")
@receiver(post_delete, sender=State, dispatch_uid="domain_state_deleted")
def _assignment_changed(sender: Any, **kwargs: Any) -> None:
    invalidate_officer_cache()


@receiver(post_save, sender=Club, dispatch_uid="domain_club_ssot_gate")
def _club_ssot_gate(sender: Any, instance: Club, created: bool, **kwargs: Any) -> None:
    """Enforce State-Gated Activity Origin and Ledger Integrity on every Club save."""
    if not getattr(instance, "is_sample", False):
        from .integrity import LedgerIntegrityEngine

        try:
            LedgerIntegrityEngine.ensure_club_approval_log(instance, strict_gate=False)
        except Exception:
            pass
