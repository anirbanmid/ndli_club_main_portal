"""Data models for the Activities app (M6 D8: Employee-module parity).

Daily Support Log rows (PLAN_0018_DUAL_LAYER.md section 6): exactly the
previous project's ``ACTIVITY_FIELDS`` semantics -- the four SEC A support
types plus the two auto-logged club-lifecycle types -- with one owner-
mandated change: club-approval log entries are DELETE-PROTECTED for
employees. The legacy "delete a Club Approval row -> cascade-delete the
club" behaviour is structurally impossible here on purpose: clubs live and
die through the governance lifecycle only, never through a log row (P3,
no ticking bombs).
"""

from __future__ import annotations

import uuid
from typing import Any

from django.conf import settings
from django.db import models


class SupportType(models.TextChoices):
    """The six support types of the previous project's activity log."""

    PHONE_CALL = (
        "Phone call and remote assistance",
        "Phone call and remote assistance",
    )
    OS_TICKET = "Closing of OS Ticket", "Closing of OS Ticket"
    ONLINE_TRAINING = "Online training", "Online training"
    OFFLINE_TRAINING = "Offline training", "Offline training"
    CLUB_APPROVAL = "Club Approval", "Club Approval"
    REGISTRATION_RENEWAL = "Registration Renewal", "Registration Renewal"


#: Manual SEC A types (the four options of the previous project's form).
SEC_A_SUPPORT_TYPES = frozenset(
    {
        SupportType.PHONE_CALL,
        SupportType.OS_TICKET,
        SupportType.ONLINE_TRAINING,
        SupportType.OFFLINE_TRAINING,
    }
)

#: Auto-logged club-lifecycle types = the "club-approval log". Employees can
#: never delete these (PLAN_0018 section 6, owner requirement).
APPROVAL_LOG_TYPES = frozenset(
    {
        SupportType.CLUB_APPROVAL,
        SupportType.REGISTRATION_RENEWAL,
    }
)

#: Only this type accepts a bulk count (parity: 1-100 = one logical entry).
BULK_SUPPORT_TYPE = SupportType.PHONE_CALL
BULK_MAX = 100


class ActivityLog(models.Model):
    """One support-log row (parity with the previous project's ACTIVITY_FIELDS)."""

    activity_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="activity_logs",
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    support_type = models.CharField(max_length=64, choices=SupportType.choices)
    priority_flag = models.BooleanField(default=False)
    club_code = models.CharField(max_length=64, blank=True)
    notes = models.TextField(blank=True)
    bulk_group = models.UUIDField(null=True, blank=True, db_index=True)
    call_count = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["employee", "-timestamp"]),
        ]

    def __str__(self) -> str:
        return f"{self.employee.username}: {self.support_type} @ {self.timestamp}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Derive the priority flag from the type (single source, P4)."""
        self.priority_flag = self.support_type in APPROVAL_LOG_TYPES
        super().save(*args, **kwargs)

    @property
    def is_approval_log(self) -> bool:
        """True for the delete-protected club-approval log types."""
        return self.support_type in APPROVAL_LOG_TYPES
