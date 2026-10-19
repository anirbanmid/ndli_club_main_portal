"""Cache-invalidation signals for the one cached derived value (P4).

``domain.assignments`` caches ``OfficerAssignment`` routing lookups; every
write to ``OfficerAssignment`` (or to a ``State``, whose zone mapping feeds
the scope joins) bumps the cache namespace so staleness is never implicit.
"""
from __future__ import annotations

from typing import Any

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .assignments import invalidate_officer_cache
from .models import OfficerAssignment, State


@receiver(post_save, sender=OfficerAssignment, dispatch_uid="domain_officer_saved")
@receiver(post_delete, sender=OfficerAssignment, dispatch_uid="domain_officer_deleted")
@receiver(post_save, sender=State, dispatch_uid="domain_state_saved")
@receiver(post_delete, sender=State, dispatch_uid="domain_state_deleted")
def _assignment_changed(sender: Any, **kwargs: Any) -> None:
    invalidate_officer_cache()
