"""Data models for the Grievances app (M6 D3: Central Grievance & SLA Dispatcher).

Delivered per ``BRIEF_M6.md`` §1 D3 + §6 C3/C4 (2026-10-24):

* ``GrievanceTicket`` — one club-authority grievance (C4: **club authorities
  only**), auto-routed to its zone via the canonical ``domain.State.zone``
  mapping (C2 — the mapping is consumed, never fabricated).
* ``SLAEvent`` — the immutable SLA ledger (breach / escalation / resolution
  marks). Dashboards derive every number from this table + ``AuditLog``
  (P4 single source: no independently counted counters anywhere).

Lifecycle timers (``reminder_due_at`` = created + 72h, ``admin_reminder_due_at``
= created + 30d, 7-day recurrent cycles after a "Not Resolved" mark) live in
``settings.GRIEVANCE_SLA`` — the ONE settings-backed store (P4).
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class GrievanceTicket(models.Model):
    """One grievance raised by a club authority, routed to its zone desk."""

    class Status(models.TextChoices):
        #: Unresolved — first 72h reminder stream running.
        OPEN = "open", "Open"
        #: Unresolved — a resolution attempt said "Not Resolved"; 7d cycle.
        NOT_RESOLVED = "not_resolved", "Not Resolved"
        #: Closed successfully; leaves the reminder streams.
        RESOLVED = "resolved", "Resolved"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    club = models.ForeignKey(
        "domain.Club",
        on_delete=models.PROTECT,
        related_name="grievance_tickets",
    )
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="grievance_tickets_raised",
    )
    # Derived from club -> institution -> state -> zone at intake (C2).
    # Stored so queue scoping is one indexed filter (P2 read paths cheap).
    state_code = models.CharField(max_length=32)
    zone_code = models.CharField(max_length=32)

    subject = models.CharField(max_length=200)
    description = models.TextField()

    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.OPEN
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="grievance_tickets_resolved",
    )

    # The reminder streams. admin_reminder_due_at is the 30-day escalation
    # anchor and is NEVER postponed by employee-side "Not Resolved" marks
    # (previous project issue_manager.py line 275 — pinned in tests).
    reminder_due_at = models.DateTimeField()
    admin_reminder_due_at = models.DateTimeField()
    is_admin_escalated = models.BooleanField(default=False)
    escalated_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["zone_code", "status"]),
            models.Index(fields=["reminder_due_at"]),
            models.Index(fields=["admin_reminder_due_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"GrievanceTicket({self.zone_code}/{self.status}: {self.subject[:30]})"


class SLAEvent(models.Model):
    """Immutable SLA ledger row (breach / escalation / resolution marks).

    The ONLY write path is ``grievances.services``; rows are append-only and
    are what the M6 dashboards read (P4 single source).
    """

    class Kind(models.TextChoices):
        #: A reminder deadline passed while the ticket was unresolved (breach).
        BREACH = "breach", "SLA breach"
        #: The 30-day central-admin escalation fired.
        ESCALATION = "escalation", "Admin escalation"
        #: A resolution attempt closed the ticket.
        RESOLVED = "resolved", "Resolved"
        #: A resolution attempt said "Not Resolved" (next 7d cycle).
        NOT_RESOLVED = "not_resolved", "Not resolved"

    ticket = models.ForeignKey(
        GrievanceTicket,
        on_delete=models.CASCADE,
        related_name="sla_events",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    occurred_at = models.DateTimeField(auto_now_add=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sla_events",
    )
    note = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["-occurred_at"]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"SLAEvent({self.ticket_id}: {self.kind})"
