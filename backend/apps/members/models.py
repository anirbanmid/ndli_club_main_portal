"""Roster join-request models (BRIEF_M4 §3 D3/D4 — campus self-join).

A campus self-join lands HERE as ``pending`` — it is NOT a membership yet.
The club admin confirms the request in the roster view (``apps.members``)
and only then does a ``domain.Membership`` row exist (D3: "joins THIS club's
roster as pending → club admin confirms in roster view").

``pending`` deliberately lives on the join request, NOT on
``domain.Membership`` (whose statuses stay the M2 lifecycle set:
active/alumni/suspended — D4 §3). One pending request per (user, club) is a
DATABASE constraint, so a replayed or double join can never pile up rows.
"""
from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.domain.models import Club


class JoinRequest(models.Model):
    """One student's request to join one club (campus passkey / QR self-join)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending confirmation"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    class Source(models.TextChoices):
        PASSKEY = "passkey", "Campus passkey"
        QR = "qr", "Join QR"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="join_requests",
    )
    club = models.ForeignKey(
        Club,
        on_delete=models.PROTECT,
        related_name="join_requests",
    )
    source = models.CharField(
        max_length=16, choices=Source.choices, default=Source.PASSKEY
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="join_requests_decided",
    )

    #: Scoping registry (core.scoping): mirrors ``domain.Membership`` exactly
    #: so the M1 policy layer scopes this table without per-view logic (I5).
    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
"state": "club__institution__state__code",
        "zone": "club__institution__state__zone__code",
        "institution": "club__institution__code",
        "club": "club__code",
        "user": "user",
    }

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "club"],
                condition=Q(status="pending"),
                name="join_request_one_pending_uniq",
            ),
        ]
        indexes = [
            models.Index(
                fields=["club", "status"], name="joinrequest_club_status_idx"
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"JoinRequest({self.user_id}@{self.club_id}, {self.status})"


# ---------------------------------------------------------------------------
# M4 D4 — dynamic student roster (BRIEF_M4 §3 D4) ----------------------------
# ---------------------------------------------------------------------------


class RosterEntry(models.Model):
    """One student row of one club's roster (BRIEF_M4 §3 D4).

    ``domain.Membership`` stays the account-linked join lifecycle row; THIS
    is the roster's student record — CSV-imported rows have no account
    (``user`` is nullable) and campus self-joins can link one. Every write
    is versioned: a change carries the version it was based on and a stale
    write is a 409 conflict, never a silent overwrite (P2 / W6).
    """

    class Role(models.TextChoices):
        MEMBER = "member", "Member"
        VOLUNTEER = "volunteer", "Volunteer"
        CORE_TEAM = "core_team", "Core team"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ALUMNI = "alumni", "Alumni"
        SUSPENDED = "suspended", "Suspended"

    #: The status machine is a CLOSED set (D4: valid transitions only) —
    #: alumni is terminal; bulk imports always land ``active``.
    VALID_TRANSITIONS: ClassVar[dict[str, frozenset[str]]] = {
        Status.ACTIVE: frozenset({Status.ALUMNI, Status.SUSPENDED}),
        Status.SUSPENDED: frozenset({Status.ACTIVE, Status.ALUMNI}),
        Status.ALUMNI: frozenset(),
    }

    club = models.ForeignKey(
        Club,
        on_delete=models.PROTECT,
        related_name="roster_entries",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="roster_entries",
    )
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    admission_no = models.CharField(max_length=64, blank=True, default="")
    program = models.CharField(max_length=128, blank=True, default="")
    batch_year = models.PositiveIntegerField(null=True, blank=True)
    role = models.CharField(
        max_length=16, choices=Role.choices, default=Role.MEMBER
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    #: Optimistic-locking counter — bumped by EVERY write path (P2).
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
"state": "club__institution__state__code",
        "zone": "club__institution__state__zone__code",
        "institution": "club__institution__code",
        "club": "club__code",
        "user": "user",
    }

    class Meta:
        ordering = ["admission_no", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["club", "admission_no"],
                condition=~Q(admission_no=""),
                name="roster_entry_club_admission_uniq",
            ),
            models.UniqueConstraint(
                fields=["club", "email"],
                condition=~Q(email=""),
                name="roster_entry_club_email_uniq",
            ),
        ]
        indexes = [
            models.Index(
                fields=["club", "status"], name="roster_entry_club_status_idx"
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.name} <{self.admission_no or self.email}> @{self.club_id}"


class RosterImportJob(models.Model):
    """One bulk CSV commit (BRIEF_M4 §3 D4 / §4b) — idempotent, chunked.

    ``idempotency_key`` is club code + the file's sha256, and UNIQUE:
    re-committing the same file can never double-write (the whole replay is
    a no-op). ``row_report`` accounts for EVERY input row (ok /
    error-with-reason / duplicate — W8 zero silent loss) and
    ``rows_processed`` is the chunk-boundary cursor (P5 resume).
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    club = models.ForeignKey(
        Club,
        on_delete=models.PROTECT,
        related_name="roster_import_jobs",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="roster_import_jobs",
    )
    idempotency_key = models.CharField(max_length=96, unique=True)
    upload_sha256 = models.CharField(max_length=64)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    total_rows = models.PositiveIntegerField(default=0)
    ok_rows = models.PositiveIntegerField(default=0)
    error_rows = models.PositiveIntegerField(default=0)
    duplicate_rows = models.PositiveIntegerField(default=0)
    rows_processed = models.PositiveIntegerField(default=0)
    row_report = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
"state": "club__institution__state__code",
        "zone": "club__institution__state__zone__code",
        "institution": "club__institution__code",
        "club": "club__code",
        "user": "created_by",
    }

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(
                fields=["club", "status"], name="roster_import_club_status_idx"
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"import {self.idempotency_key} ({self.status})"

    def totals(self) -> dict[str, int]:
        """The W8 accounting identity: total == ok + errors + duplicates."""
        return {
            "total": self.total_rows,
            "ok": self.ok_rows,
            "errors": self.error_rows,
            "duplicates": self.duplicate_rows,
        }
