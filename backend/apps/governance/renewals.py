"""M6 D5 renewal desk service — BOTH Q1 paths (BRIEF_M6 §6 owner decisions).

* **Path A**: a club authority submits a renewal request -> the EMP (or
  CentralAdmin) reviews and issues the renewal certificate.
* **Path B**: the EMP issues directly from the renewal-attention queue.

Renewal anchor (C3): formation date + 1 year; every ISSUED renewal extends
from its own issue date + 1 year. Attention = OVERDUE or due within
``ATTENTION_WINDOW_DAYS`` (30). Certificates always mint through the ONE
issuer (``certificates.issue.issue_certificate``, P4). Every mutation writes
an immutable AuditLog row (BRIEF_M6 §2). Out-of-zone rows are indistinguish-
able from missing ones (queryset-level scoping happens in the views).
"""
from __future__ import annotations

from datetime import date
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.audit import services as audit
from apps.certificates.issue import issue_certificate
from apps.certificates.models import CertificateCategory
from apps.domain.models import Club

from .materialisation import _ROLE_TO_SUB_ROLE, _TIER_PRIORITY
from .models import RenewalRecord
from .services import (
    ZONE_BOUND_SUB_ROLES,
    GovernanceError,
    _sub_role,
    _zone_code,
    ensure_decider,
)

#: C3: attention = overdue OR expiring within 30 days.
ATTENTION_WINDOW_DAYS = 30


def _anniversary(base: date, *, years: int = 1) -> date:
    """``base`` + N years (Feb 29 -> Feb 28, keeps the calendar honest)."""
    try:
        return base.replace(year=base.year + years)
    except ValueError:
        return base.replace(year=base.year + years, day=28)


def _zone_of(club: Club) -> str:
    # State.zone is keyed by Zone PK; the OFFICER code lives on Zone.code.
    return str(club.institution.state.zone.code)


def _open_request(club: Club) -> RenewalRecord | None:
    return club.renewal_records.filter(
        status=RenewalRecord.Status.REQUESTED
    ).first()


def _last_issued(
    club: Club, records: list[RenewalRecord] | None = None
) -> RenewalRecord | None:
    pool = (
        records
        if records is not None
        else list(club.renewal_records.all())
    )
    issued = [r for r in pool if r.status == RenewalRecord.Status.ISSUED]
    if not issued:
        return None
    return max(issued, key=lambda r: (r.decided_at or r.created_at, r.pk))


def due_date_for(
    club: Club,
    *,
    last: RenewalRecord | None = None,
    records: list[RenewalRecord] | None = None,
) -> date:
    """Renewal due date: last ISSUED renewal + 1y, else formation + 1y."""
    last = last if last is not None else _last_issued(club, records)
    base = (
        (last.decided_at.date() if last and last.decided_at else None)
        or club.created_at.date()
    )
    return _anniversary(base)


def state_payload(
    club: Club, *, records: list[RenewalRecord] | None = None
) -> dict[str, Any]:
    """One attention-queue row (derived at query time — P4, no counters)."""
    pool = records if records is not None else list(club.renewal_records.all())
    last = _last_issued(club, pool)
    due = due_date_for(club, last=last, records=pool)
    today = timezone.localdate()
    days_left = (due - today).days
    open_req = next(
        (r for r in pool if r.status == RenewalRecord.Status.REQUESTED), None
    )
    return {
        "club_code": club.code,
        "club_name": club.name,
        "zone_code": _zone_of(club),
        "formation_date": club.created_at.date().isoformat(),
        "last_renewal_date": (
            last.decided_at.date().isoformat() if last and last.decided_at else None
        ),
        "due_date": due.isoformat(),
        "days_left": days_left,
        "attention": (
            "overdue"
            if days_left < 0
            else "expiring"
            if days_left <= ATTENTION_WINDOW_DAYS
            else "ok"
        ),
        "open_request": record_payload(open_req) if open_req else None,
    }


def record_payload(record: RenewalRecord) -> dict[str, Any]:
    return {
        "id": record.pk,
        "club_code": record.club.code if record.club_id else "",
        "status": record.status,
        "request_note": record.request_note,
        "requested_at": record.created_at.isoformat(),
        "decision_note": record.decision_note,
        "decided_at": record.decided_at.isoformat() if record.decided_at else None,
        "certificate_id": (
            record.certificate.certificate_id if record.certificate_id else None
        ),
    }


#: accounts sub-role -> holder tier rank (built from the D2b tables at import
#: time, tolerating either key space in _TIER_PRIORITY).
_SUB_ROLE_RANK: dict[str, int] = {}
for _role, _sub in _ROLE_TO_SUB_ROLE.items():
    for _key, _rank in _TIER_PRIORITY.items():
        if str(_key) == str(_role) or str(_key) == str(_sub):
            _SUB_ROLE_RANK[str(_sub)] = int(_rank)


def _default_holder(club: Club) -> Any | None:
    """Most senior provisioned club authority (same tier rule as D2b)."""
    best: Any = None
    best_rank = len(_SUB_ROLE_RANK) + 1
    for user in User.objects.filter(club=club, is_active=True):
        rank = _SUB_ROLE_RANK.get(str(getattr(user, "sub_role", "")))
        if rank is not None and rank < best_rank:
            best, best_rank = user, rank
    return best


def attention_for(user: Any) -> list[dict[str, Any]]:
    """The caller's renewal-attention queue (zone-scoped for officers)."""
    ensure_decider(user)
    qs = Club.objects.select_related("institution__state").prefetch_related(
        "renewal_records"
    )
    if _sub_role(user) in ZONE_BOUND_SUB_ROLES:
        qs = qs.filter(institution__state__zone__code=_zone_code(user))
    rows: list[dict[str, Any]] = []
    for club in qs.order_by("name"):
        records = list(club.renewal_records.all())
        payload = state_payload(club, records=records)
        if payload["days_left"] <= ATTENTION_WINDOW_DAYS:
            rows.append(payload)
    rows.sort(key=lambda r: r["due_date"])
    return rows


def request_renewal(
    user: Any, *, note: str = "", request: Any = None
) -> RenewalRecord:
    """Path A step 1: a club authority asks for renewal (one open at a time)."""
    # club_id first: a bare ``user.club`` raises DoesNotExist on a null FK.
    club = user.club if getattr(user, "club_id", None) else None
    if club is None:
        raise GovernanceError("account is not club-scoped")
    if _open_request(club) is not None:
        raise GovernanceError("a renewal request is already open")
    record = RenewalRecord.objects.create(
        club=club,
        requested_by=user,
        request_note=str(note)[:500],
    )
    audit.record(
        action="renewal.request",
        request=request,
        object_type="renewal_record",
        object_id=str(record.pk),
        institution_code=str(getattr(club.institution, "code", "") or ""),
        zone_code=_zone_of(club),
        detail={"club_code": club.code},
    )
    return record


def _ensure_zone_scope(user: Any, club: Club) -> None:
    if _sub_role(user) in ZONE_BOUND_SUB_ROLES and _zone_of(club) != str(
        _zone_code(user)
    ):
        # Indistinguishable from missing (P0 — never leak row existence).
        raise GovernanceError("not found")


@transaction.atomic
def issue_renewal(
    user: Any,
    *,
    record: RenewalRecord | None = None,
    club: Club | None = None,
    request: Any = None,
) -> tuple[RenewalRecord, Any]:
    """Issue a renewal certificate — Path A (open request) or Path B (direct).

    Holder rule: the requesting authority when there is a request, else the
    most senior provisioned authority (D2b tier rule, P4).
    """
    ensure_decider(user)
    if record is not None:
        club = record.club
        if record.status != RenewalRecord.Status.REQUESTED:
            raise GovernanceError("renewal request is not open")
    if club is None:
        raise GovernanceError("club required")
    club = Club.objects.select_related("institution__state").get(pk=club.pk)
    _ensure_zone_scope(user, club)

    holder = (
        record.requested_by
        if (record is not None and record.requested_by_id)
        else _default_holder(club)
    )
    if holder is None or getattr(holder, "club_id", None) != club.pk:
        holder = _default_holder(club)
    if holder is None:
        raise GovernanceError(
            "club has no provisioned authority to hold the certificate"
        )

    today = timezone.localdate()
    cert = issue_certificate(
        holder=holder,
        club=club,
        category=CertificateCategory.RENEWAL,
        event_ref=f"renewal-{club.code}-{today.year}",
        event_title=f"Club Renewal — {club.name}",
        event_date=today,
        issue_date=today,
    )
    if record is None:
        record = RenewalRecord(club=club)
    record.status = RenewalRecord.Status.ISSUED
    record.decided_by = user
    record.decided_at = timezone.now()
    record.certificate = cert
    record.save()

    audit.record(
        action="renewal.issue",
        request=request,
        object_type="renewal_record",
        object_id=str(record.pk),
        institution_code=str(getattr(club.institution, "code", "") or ""),
        zone_code=_zone_of(club),
        detail={
            "club_code": club.code,
            "certificate_id": cert.certificate_id,
            "path": "A" if record.requested_by_id else "B",
        },
    )
    return record, cert


@transaction.atomic
def reject_renewal(
    user: Any, *, record: RenewalRecord, note: str = "", request: Any = None
) -> RenewalRecord:
    """Reject an open renewal request (Path A only — never silent loss)."""
    ensure_decider(user)
    _ensure_zone_scope(user, record.club)
    if record.status != RenewalRecord.Status.REQUESTED:
        raise GovernanceError("renewal request is not open")
    record.status = RenewalRecord.Status.REJECTED
    record.decided_by = user
    record.decided_at = timezone.now()
    record.decision_note = str(note)[:500]
    record.save()
    audit.record(
        action="renewal.reject",
        request=request,
        object_type="renewal_record",
        object_id=str(record.pk),
        institution_code=str(getattr(record.club.institution, "code", "") or ""),
        zone_code=_zone_of(record.club),
        detail={"club_code": record.club.code},
    )
    return record
