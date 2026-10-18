"""Append-only, tamper-evident AuditLog (BRIEF_M1.md §5).

Every row is chained to its predecessor via SHA-256 (``prev_hash`` /
``entry_hash``). Rows are created server-side only, through
``apps.audit.services.record`` (or the ``@audit_action`` decorator /
``AuditMixin``); there is NO update or delete path — the model, manager
and queryset all refuse mutation.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from django.db import models
from django.utils import timezone

GENESIS_HASH = "0" * 64


class AuditLogQuerySet(models.QuerySet):
    """Queryset that refuses mutation (append-only)."""

    def update(self, **kwargs: object) -> int:
        raise PermissionError("AuditLog is append-only: update() is not allowed")

    def delete(self) -> tuple[int, dict[str, int]]:
        raise PermissionError("AuditLog is append-only: delete() is not allowed")

    def bulk_update(
        self, objs: object, fields: object = None, batch_size: object = None
    ) -> int:
        raise PermissionError("AuditLog is append-only: bulk_update() is not allowed")

    def _for_write(self) -> bool:
        return True


class AuditLogManager(models.Manager.from_queryset(AuditLogQuerySet)):  # type: ignore[misc]
    """Manager that refuses bulk creation outside the hashing path."""

    def bulk_create(self, *args: object, **kwargs: object) -> object:
        raise PermissionError(
            "AuditLog is append-only: use apps.audit.services.record()"
        )


class AuditLog(models.Model):
    """One immutable audit row."""

    seq = models.BigAutoField(primary_key=True)
    timestamp = models.DateTimeField(default=timezone.now)

    actor_id = models.BigIntegerField(null=True, blank=True)
    actor_label = models.CharField(max_length=150, blank=True, default="")
    category = models.CharField(max_length=32, blank=True, default="")

    action = models.CharField(max_length=128)
    outcome = models.CharField(max_length=16, default="success")
    object_type = models.CharField(max_length=64, blank=True, default="")
    object_id = models.CharField(max_length=64, blank=True, default="")

    institution_code = models.CharField(max_length=64, blank=True, default="")
    zone_code = models.CharField(max_length=64, blank=True, default="")

    request_id = models.CharField(max_length=64, blank=True, default="")
    ip_address = models.CharField(max_length=64, blank=True, default="")
    user_agent = models.CharField(max_length=256, blank=True, default="")

    detail = models.JSONField(default=dict, blank=True)

    prev_hash = models.CharField(max_length=64)
    entry_hash = models.CharField(max_length=64)

    objects = AuditLogManager()

    class Meta:
        ordering = ["seq"]
        indexes = [
            models.Index(fields=["action", "timestamp"]),
            models.Index(fields=["actor_id", "timestamp"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"AuditLog({self.seq}, {self.action}, {self.outcome})"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise PermissionError("AuditLog is append-only: rows cannot be updated")
        if "force_insert" not in kwargs and "update_fields" in kwargs:
            raise PermissionError("AuditLog is append-only: rows cannot be updated")
        self.prev_hash = (
            AuditLog.objects.order_by("-seq")
            .values_list("entry_hash", flat=True)
            .first()
            or GENESIS_HASH
        )
        self.entry_hash = compute_entry_hash(self)
        kwargs["force_insert"] = True
        super().save(*args, **kwargs)

    def delete(self, *args: Any, **kwargs: Any) -> tuple[int, dict[str, int]]:
        raise PermissionError("AuditLog is append-only: rows cannot be deleted")


def compute_entry_hash(row: AuditLog) -> str:
    """SHA-256 over the canonical representation of the row + prev_hash."""
    canonical = json.dumps(
        {
            "timestamp": row.timestamp.isoformat(),
            "actor_id": row.actor_id,
            "actor_label": row.actor_label,
            "category": row.category,
            "action": row.action,
            "outcome": row.outcome,
            "object_type": row.object_type,
            "object_id": row.object_id,
            "institution_code": row.institution_code,
            "zone_code": row.zone_code,
            "request_id": row.request_id,
            "ip_address": row.ip_address,
            "user_agent": row.user_agent,
            "detail": row.detail,
            "prev_hash": row.prev_hash,
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()
