"""M4 D4 HTTP views — dynamic student roster (BRIEF_M4 §3 D4).

Every roster endpoint is club-activity-controlling (W9): writes, imports
and exports are club-authority only, and every read is scoped per caller
through the ONE policy layer (``CategoryGate`` + ``core.scoping``) — no
hand-rolled authorization here (I5). Out-of-scope IDs are 404s, never data
(W6: a wrong-club admin gets nothing even via id swaps). Inline edits are
single-field and optimistic-locked: a stale write is a 409 conflict
carrying the current row, never a silent overwrite (P2).
"""

from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import F
from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.policies import CLUB_AUTHORITY_GATE, CLUB_MODULE_GATE, ObjectScope
from apps.core import scoping
from apps.domain.models import Club

from . import roster_csv, services
from .models import RosterEntry, RosterImportJob

#: Single-field inline edit allowlist (status moves via its own endpoint).
EDITABLE_FIELDS = frozenset(
    {"name", "email", "phone", "admission_no", "program", "batch_year", "role"}
)


def _payload(request: Request) -> dict[str, Any]:
    data = request.data
    return data if isinstance(data, dict) else {}


def _entry_payload(entry: RosterEntry) -> dict[str, Any]:
    return {
        "id": entry.pk,
        "club": entry.club.code,
        "name": entry.name,
        "email": entry.email,
        "phone": entry.phone,
        "admission_no": entry.admission_no,
        "program": entry.program,
        "batch_year": entry.batch_year,
        "role": entry.role,
        "status": entry.status,
        "version": entry.version,
        "updated_at": entry.updated_at.isoformat(),
        "user_id": entry.user_id,
    }


def _job_payload(job: RosterImportJob, *, replayed: bool = False) -> dict[str, Any]:
    return {
        "id": job.pk,
        "status": job.status,
        "idempotency_key": job.idempotency_key,
        "totals": job.totals(),
        "rows_processed": job.rows_processed,
        "row_report": list(job.row_report),
        "replayed": replayed,
    }


def _csv_error(exc: roster_csv.CsvContractError) -> Response:
    return Response({"detail": exc.message, "code": exc.code}, status=exc.http_status)


def _caller_club(request: Request) -> Club:
    """The ONE club the caller's scope keys resolve to (mechanical scoping)."""
    club = scoping.scope_clubs(Club.objects.all(), request.user).first()
    if club is None:
        raise NotFound("Not found.")
    return club


def _scoped_entry(request: Request, pk: int) -> RosterEntry:
    """Load one roster row inside the caller's scope (else 404, never data)."""
    entry = (
        scoping.scope_members(RosterEntry.objects.select_related("club"), request.user)
        .filter(pk=pk)
        .first()
    )
    if entry is None:
        raise NotFound("Not found.")
    return entry


def _expected_version(payload: dict[str, Any]) -> int | None:
    value = payload.get("version")
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def _stale_timestamp(entry: RosterEntry, raw: Any) -> bool | None:
    """The documented ``updated_at`` cross-check (spec: "version/updated-at
    check"). Returns True when ``raw`` is NOT the row's current clock,
    False when it matches, None when unreadable (400).

    The version guard stays THE lock (one locking truth, P4) — this is the
    client-held timestamp check that maps to the exact same 409, earlier.
    """
    if not isinstance(raw, str):
        return None
    parsed = parse_datetime(raw)
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed != entry.updated_at


def _page(request: Request) -> tuple[int, int]:
    """``limit`` / ``offset`` pagination with a hard 1000-row page cap (P1)."""
    try:
        limit = int(request.query_params.get("limit", 1000))
        offset = int(request.query_params.get("offset", 0))
    except (TypeError, ValueError):
        return 1000, 0
    return max(1, min(limit, 1000)), max(0, offset)


def _synthetic_cells(entry: RosterEntry, field_name: str, value: Any) -> list[str]:
    """The entry's row with ONE field replaced — revalidated by the CSV contract."""
    draft = {
        "name": entry.name,
        "email": entry.email,
        "phone": entry.phone,
        "admission_no": entry.admission_no,
        "program": entry.program,
        "batch_year": "" if entry.batch_year is None else str(entry.batch_year),
        "role": entry.role,
    }
    draft[field_name] = "" if value is None else str(value)
    return [draft[column] for column in roster_csv.CONTRACT_COLUMNS]


def _conflict(request: Request, entry: RosterEntry) -> Response:
    return Response(
        {
            "detail": "The row changed since you loaded it.",
            "code": "version_conflict",
            "current": _entry_payload(entry),
        },
        status=409,
    )


def _apply_field_change(
    request: Request,
    entry: RosterEntry,
    field_name: str,
    value: Any,
    expected: int,
) -> Response:
    """Apply ONE field change behind the optimistic lock (P2 / W6)."""
    outcome = roster_csv.validate_row(
        entry.pk, _synthetic_cells(entry, field_name, value)
    )
    if outcome.status != "ok":
        return Response(
            {"detail": f"Rejected: {outcome.reason}.", "code": outcome.reason},
            status=400,
        )
    cleaned = outcome.data.get(field_name)
    if field_name in ("email", "admission_no") and cleaned:
        clash = (
            RosterEntry.objects.filter(club=entry.club, **{field_name: cleaned})
            .exclude(pk=entry.pk)
            .exists()
        )
        if clash:
            return Response(
                {
                    "detail": "Another roster row already uses that value.",
                    "code": "duplicate_entry",
                },
                status=409,
            )
    with transaction.atomic():
        changed = RosterEntry.objects.filter(pk=entry.pk, version=expected).update(
            **{field_name: cleaned},
            version=F("version") + 1,
            updated_at=timezone.now(),
        )
    if not changed:
        current = _scoped_entry(request, entry.pk)
        return _conflict(request, current)
    entry.refresh_from_db()
    services._audit(
        "roster.entry.updated",
        request,
        actor=request.user,
        object_type="roster_entry",
        object_id=str(entry.pk),
        club=entry.club_id,
        field=field_name,
    )
    return Response(_entry_payload(entry))


class RosterListView(APIView):
    """``GET /api/v1/members/roster/`` — club rows; students: own rows only.

    Row visibility is purely mechanical (W6 / I1-I5): ``scope_members``
    gives a student exactly their own rows and a club authority their own
    club's rows — the view never decides who sees what.
    """

    permission_classes = [IsAuthenticated, CLUB_MODULE_GATE]

    def get(self, request: Request) -> Response:
        queryset = scoping.scope_members(
            RosterEntry.objects.select_related("club"), request.user
        )
        status_filter = request.query_params.get("status", "")
        if status_filter in RosterEntry.Status.values:
            queryset = queryset.filter(status=status_filter)
        limit, offset = _page(request)
        entries = [
            _entry_payload(entry)
            for entry in queryset.order_by("admission_no", "id")[
                offset : offset + limit
            ]
        ]
        return Response(
            {
                "entries": entries,
                "count": len(entries),
                "total": queryset.count(),
                "offset": offset,
                "limit": limit,
            }
        )


class RosterCreateView(APIView):
    """``POST /api/v1/members/roster/add/`` — the single add row (W9)."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE, ObjectScope("members")]

    def post(self, request: Request) -> Response:
        club = _caller_club(request)
        payload = _payload(request)
        unknown = set(payload) - set(roster_csv.CONTRACT_COLUMNS)
        if unknown:
            return Response(
                {
                    "detail": "Unknown fields: " + ", ".join(sorted(unknown)),
                    "code": "unknown_field",
                },
                status=400,
            )
        cells = [
            "" if payload.get(column) is None else str(payload.get(column, ""))
            for column in roster_csv.CONTRACT_COLUMNS
        ]
        outcome = roster_csv.validate_row(0, cells)
        if outcome.status != "ok":
            return Response(
                {"detail": f"Rejected: {outcome.reason}.", "code": outcome.reason},
                status=400,
            )
        probes = roster_csv.probe_keys(outcome.data)
        if roster_csv._existing_keys(club, probes):
            return Response(
                {
                    "detail": "Another roster row already uses that value.",
                    "code": "duplicate_entry",
                },
                status=409,
            )
        try:
            with transaction.atomic():
                entry = RosterEntry.objects.create(
                    club=club,
                    **{
                        column: outcome.data[column]
                        for column in roster_csv.CONTRACT_COLUMNS
                    },
                )
        except IntegrityError:
            return Response(
                {
                    "detail": "Another roster row already uses that value.",
                    "code": "duplicate_entry",
                },
                status=409,
            )
        services._audit(
            "roster.entry.created",
            request,
            actor=request.user,
            object_type="roster_entry",
            object_id=str(entry.pk),
            club=club.pk,
        )
        return Response(_entry_payload(entry), status=201)


class RosterEditView(APIView):
    """``PATCH /api/v1/members/roster/<pk>/`` — ONE field, optimistic-locked."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE, ObjectScope("members")]

    def patch(self, request: Request, pk: int) -> Response:
        entry = _scoped_entry(request, pk)
        payload = _payload(request)
        if set(payload) - {"field", "value", "version", "updated_at"}:
            return Response(
                {
                    "detail": "Edit exactly one field per request.",
                    "code": "single_field_only",
                },
                status=400,
            )
        if "updated_at" in payload:
            stale = _stale_timestamp(entry, payload.get("updated_at"))
            if stale is None:
                return Response(
                    {
                        "detail": "Unreadable updated_at.",
                        "code": "bad_updated_at",
                    },
                    status=400,
                )
            if stale:
                return _conflict(request, entry)
        field_name = str(payload.get("field", ""))
        if field_name not in EDITABLE_FIELDS:
            return Response(
                {
                    "detail": "That field cannot be edited inline.",
                    "code": "field_not_editable",
                },
                status=400,
            )
        expected = _expected_version(payload)
        if expected is None:
            return Response(
                {"detail": "A row version is required.", "code": "version_required"},
                status=400,
            )
        return _apply_field_change(
            request, entry, field_name, payload.get("value"), expected
        )


class RosterStatusView(APIView):
    """``POST /api/v1/members/roster/<pk>/status/`` — the closed transition set."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE, ObjectScope("members")]

    def post(self, request: Request, pk: int) -> Response:
        entry = _scoped_entry(request, pk)
        payload = _payload(request)
        expected = _expected_version(payload)
        if expected is None:
            return Response(
                {"detail": "A row version is required.", "code": "version_required"},
                status=400,
            )
        target = str(payload.get("status", ""))
        allowed = RosterEntry.VALID_TRANSITIONS.get(entry.status, frozenset())
        if target not in allowed:
            return Response(
                {
                    "detail": "That status transition is not allowed.",
                    "code": "invalid_transition",
                    "current": entry.status,
                    "allowed": sorted(allowed),
                },
                status=409,
            )
        with transaction.atomic():
            changed = RosterEntry.objects.filter(pk=entry.pk, version=expected).update(
                status=target, version=F("version") + 1, updated_at=timezone.now()
            )
        if not changed:
            current = _scoped_entry(request, entry.pk)
            return _conflict(request, current)
        entry.refresh_from_db()
        services._audit(
            "roster.status.changed",
            request,
            actor=request.user,
            object_type="roster_entry",
            object_id=str(entry.pk),
            club=entry.club_id,
            status=target,
        )
        return Response(_entry_payload(entry))


class RosterImportTemplateView(APIView):
    """``GET /api/v1/members/roster/import/template/`` — the frozen contract."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE, ObjectScope("members")]

    def get(self, request: Request) -> HttpResponse:
        response = HttpResponse(
            roster_csv.template_text(), content_type="text/csv; charset=utf-8"
        )
        response["Content-Disposition"] = (
            'attachment; filename="roster_import_template.csv"'
        )
        return response


class RosterImportUploadView(APIView):
    """``POST /api/v1/members/roster/import/upload/`` — hash-stored staging."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE, ObjectScope("members")]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request) -> Response:
        club = _caller_club(request)
        uploaded = request.FILES.get("file")
        if uploaded is None:
            return Response(
                {"detail": "A CSV file is required.", "code": "file_required"},
                status=400,
            )
        if not str(uploaded.name or "").lower().endswith(".csv"):
            return Response(
                {
                    "detail": "Only .csv files are accepted.",
                    "code": "unsupported_file",
                },
                status=400,
            )
        try:
            upload_id, size = roster_csv.store_upload(uploaded, club)
        except roster_csv.CsvContractError as exc:
            return _csv_error(exc)
        services._audit(
            "roster.import.uploaded",
            request,
            actor=request.user,
            object_type="roster_upload",
            object_id=upload_id,
            club=club.pk,
            size_bytes=size,
        )
        return Response(
            {"upload_id": upload_id, "sha256": upload_id, "size_bytes": size}
        )


class RosterImportDryRunView(APIView):
    """``POST .../import/dry-run/`` — the pipeline with commit=False.

    NOTHING is written to the database (not even a job row): the response IS
    the preview — parsed rows, per-row validity, duplicates and totals.
    """

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE, ObjectScope("members")]

    def post(self, request: Request) -> Response:
        club = _caller_club(request)
        upload_id = str(_payload(request).get("upload_id", ""))
        try:
            source_path = roster_csv.resolve_upload(upload_id, club)
            report = roster_csv.process_file(
                club=club, source_path=source_path, commit=False
            )
        except roster_csv.CsvContractError as exc:
            return _csv_error(exc)
        return Response(
            {
                "committed": False,
                "totals": report["totals"],
                "rows": report["rows"],
                "contract": {
                    "columns": list(roster_csv.CONTRACT_COLUMNS),
                    "delimiter": roster_csv.DELIMITER,
                    "max_rows": roster_csv.max_rows(),
                    "max_bytes": roster_csv.max_bytes(),
                },
            }
        )


class RosterImportCommitView(APIView):
    """``POST .../import/commit/`` — idempotent, chunked, row-level report.

    Re-committing the same file is a NO-OP replay of the recorded job
    (idempotency key = club + file hash, W7). The sync-chunked fallback
    runner executes it here; the async worker is a config seam (§4b).
    """

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE, ObjectScope("members")]

    def post(self, request: Request) -> Response:
        club = _caller_club(request)
        upload_id = str(_payload(request).get("upload_id", ""))
        try:
            roster_csv.resolve_upload(upload_id, club)
        except roster_csv.CsvContractError as exc:
            return _csv_error(exc)
        idempotency_key = f"{club.code}:{upload_id}"
        job = RosterImportJob.objects.filter(idempotency_key=idempotency_key).first()
        if job is not None and job.status == RosterImportJob.Status.COMPLETED:
            return Response(_job_payload(job, replayed=True))
        if job is None:
            try:
                with transaction.atomic():
                    job = RosterImportJob.objects.create(
                        club=club,
                        created_by=request.user,
                        idempotency_key=idempotency_key,
                        upload_sha256=upload_id,
                    )
            except IntegrityError:
                job = RosterImportJob.objects.get(idempotency_key=idempotency_key)
        try:
            roster_csv.run_import_job(job, request=request)
        except roster_csv.CsvContractError as exc:
            return _csv_error(exc)
        job.refresh_from_db()
        services._audit(
            "roster.import.committed",
            request,
            actor=request.user,
            object_type="roster_import",
            object_id=str(job.pk),
            club=club.pk,
            totals=job.totals(),
        )
        return Response(_job_payload(job))


class RosterImportJobView(APIView):
    """``GET .../import/jobs/<pk>/`` — progress + row-level error report."""

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE, ObjectScope("members")]

    def get(self, request: Request, pk: int) -> Response:
        job = (
            scoping.scope_members(RosterImportJob.objects.all(), request.user)
            .filter(pk=pk)
            .first()
        )
        if job is None:
            raise NotFound("Not found.")
        return Response(_job_payload(job))


class RosterExportView(APIView):
    """``GET /api/v1/members/roster/export/`` — streaming, formula-neutralized.

    P0 CSV-injection hardening: every cell is prefix-escaped before it is
    written, so no spreadsheet app executes an exported value (W7).
    """

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE, ObjectScope("members")]

    def get(self, request: Request) -> StreamingHttpResponse:
        club = _caller_club(request)
        entries = scoping.scope_members(
            RosterEntry.objects.all(), request.user
        ).order_by("admission_no", "id")
        response = StreamingHttpResponse(
            roster_csv.export_lines(entries),
            content_type="text/csv; charset=utf-8",
        )
        response["Content-Disposition"] = (
            f'attachment; filename="roster-{club.code}.csv"'
        )
        return response
