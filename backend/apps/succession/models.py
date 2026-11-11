"""Data models for the Succession app (M2-A3 dual-control succession desk).

One ``SuccessionRequest`` = one proposed handover of a club-authority post
(one of the four ``domain.AuthorityAssignment`` tiers):

* Submission records the proposed holder (name / email / phone), the reason
  and a **conflict snapshot** — the ACTIVE posts that email already holds
  elsewhere. The snapshot travels with the request, so the approving IIT Kgp
  employee re-verifies exactly what was asked (reverification + decision).
* The decision fields (``status`` / ``decided_by`` / ``decided_at`` /
  ``decision_note``) are written by ``succession.services`` ONLY — the API
  layer never mass-assigns them.
* One open request per club+tier is enforced in the DATABASE (partial unique
  constraint), not merely in code.
"""

from __future__ import annotations

import uuid
from typing import ClassVar

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.domain.models import AuthorityAssignment, Club


class SuccessionRequest(models.Model):
    """One proposed authority handover awaiting dual-control approval."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    club = models.ForeignKey(
        Club,
        on_delete=models.PROTECT,
        related_name="succession_requests",
    )
    #: The post being handed over — the SAME enum as the assignment it ends,
    #: so the tier can never drift between the two tables (P4 single source).
    tier = models.CharField(max_length=16, choices=AuthorityAssignment.Tier.choices)

    proposed_name = models.CharField(max_length=150)
    proposed_email = models.EmailField()
    proposed_phone = models.CharField(max_length=32, blank=True, default="")
    reason = models.TextField()

    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    #: The conflict info the approver re-verifies (list of dicts shaped by
    #: ``services.conflicts_for``), frozen at submission time.
    conflict_snapshot = models.JSONField(default=list, blank=True)
    #: True only when conflicts existed AND the requester confirmed the handover.
    conflicts_confirmed = models.BooleanField(default=False)

    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="succession_requests_submitted",
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="succession_requests_decided",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=500, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    #: Scoping registry (``core.scoping``) — club door / duty-state desks.
    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
        "state": "club__institution__state__code",
        "zone": "club__institution__state__zone__code",
        "institution": "club__institution__code",
        "club": "club",
    }

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["club", "status"], name="succ_club_status_idx"),
            models.Index(
                fields=["status", "created_at"], name="succ_status_created_idx"
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["club", "tier"],
                condition=Q(status="pending"),
                name="succ_one_pending_per_post",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.tier}@{self.club_id} ({self.status})"
