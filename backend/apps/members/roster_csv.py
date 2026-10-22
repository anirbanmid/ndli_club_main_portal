"""M4 D4 bulk CSV pipeline — ONE code path, two runners (BRIEF_M4 §3 D4, §4b).

The pipeline STREAMS (``iter_raw_rows`` is a generator over a file handle —
no full-file-in-memory expansion) and writes in chunks
(``ROSTER_IMPORT_CHUNK_SIZE`` = one short transaction per chunk, P2).
``dry-run`` is literally THIS pipeline with ``commit=False``: nothing is
written to the database and the reported totals are exactly the totals the
commit run reports (W8 zero-silent-loss, P4 one schema object).

CSV hardening (P0):

* import is UTF-8 BOM tolerant (``utf-8-sig``) and refuses anything that is
  not the fixed comma / RFC4180 contract (delimiter sniffing = clean 4xx);
* formula cells (leading ``=+-@`` / tab / CR) are REJECTED per row with a
  clean row-level error (W7) — never stored, never later exported raw;
* export NEUTRALIZES every leading ``=+-@`` by prefix-escaping the cell with
  ``'`` (RFC quoting alone does not stop spreadsheet apps from executing a
  formula, so the value is made inert before the writer quotes it).
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.module_loading import import_string

from apps.domain.models import Club

from .models import RosterEntry, RosterImportJob

#: M4-A3: the frozen template contract (ONE schema object, P4). The header
#: must match this exactly — column order included.
CONTRACT_COLUMNS: tuple[str, ...] = (
    "name",
    "email",
    "phone",
    "admission_no",
    "program",
    "batch_year",
    "role",
)
DELIMITER = ","
#: A cell starting with any of these can execute as a formula in
#: spreadsheet apps (CSV injection, OWASP).
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^[0-9+()\-\s]{1,32}$")
BATCH_YEAR_MIN = 1950
BATCH_YEAR_MAX = 2100
ROLE_CHOICES = frozenset(choice.value for choice in RosterEntry.Role)


class CsvContractError(Exception):
    """Contract-level failure (bad header/encoding/size) — a clean 4xx."""

    def __init__(
        self, message: str, *, code: str, http_status: int = 400
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.http_status = http_status


@dataclass
class RowOutcome:
    """The fate of exactly ONE input row (W8: nobody is dropped silently)."""

    row: int
    status: str  # "ok" | "error" | "duplicate"
    reason: str = ""
    key: str = ""
    data: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "row": self.row,
            "status": self.status,
            "reason": self.reason,
            "key": self.key,
            "data": self.data,
        }


# --- Hard limits (BRIEF §3 D4: 10k rows / 5 MB) ----------------------------


def max_bytes() -> int:
    return int(getattr(settings, "ROSTER_IMPORT_MAX_BYTES", 5 * 1024 * 1024))


def max_rows() -> int:
    return int(getattr(settings, "ROSTER_IMPORT_MAX_ROWS", 10_000))


def chunk_size() -> int:
    return int(getattr(settings, "ROSTER_IMPORT_CHUNK_SIZE", 500))


def sync_limit() -> int:
    return int(getattr(settings, "ROSTER_IMPORT_SYNC_LIMIT", 10_000))


def import_root() -> Path:
    configured = getattr(settings, "ROSTER_IMPORT_ROOT", None)
    if configured:
        return Path(configured)
    return Path(settings.BASE_DIR) / "var" / "roster_imports"


def _club_dir(club: Club) -> str:
    """Filesystem-safe per-club subdirectory (uploads are club-scoped)."""
    return re.sub(r"[^A-Za-z0-9_-]", "_", club.code or "club")


# --- Upload storage (P0: hash-stored name, streamed, capped) ---------------


def store_upload(uploaded: Any, club: Club) -> tuple[str, int]:
    """Stream an upload to ``<root>/<club>/<sha256>.csv`` and return (id, size).

    P0: the stored name is the content hash, NEVER the user filename; the
    bytes are streamed in chunks (no full-file-in-memory expansion) and the
    hard size cap is enforced before any parsing. Per-club directories keep
    one club's file out of every other club's reach (W6).
    """
    root = import_root() / _club_dir(club)
    root.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    size = 0
    temporary = root / "incoming.part"
    with temporary.open("wb") as handle:
        for chunk in uploaded.chunks():
            size += len(chunk)
            if size > max_bytes():
                handle.close()
                temporary.unlink(missing_ok=True)
                raise CsvContractError(
                    f"Upload exceeds the {max_bytes() // (1024 * 1024)} MB cap.",
                    code="file_too_large",
                    http_status=413,
                )
            digest.update(chunk)
            handle.write(chunk)
    if size == 0:
        temporary.unlink(missing_ok=True)
        raise CsvContractError("Empty file.", code="empty_file")
    upload_id = digest.hexdigest()
    target = root / f"{upload_id}.csv"
    if target.exists():
        temporary.unlink(missing_ok=True)
    else:
        temporary.replace(target)
    return upload_id, size


def resolve_upload(upload_id: str, club: Club) -> Path:
    """Validate an upload id (64 hex) and return its club-scoped path."""
    if len(upload_id) != 64 or any(
        char not in "0123456789abcdef" for char in upload_id
    ):
        raise CsvContractError("Unknown upload.", code="bad_upload_id")
    path = import_root() / _club_dir(club) / f"{upload_id}.csv"
    if not path.is_file():
        raise CsvContractError(
            "Unknown upload.", code="upload_not_found", http_status=404
        )
    return path


# --- The ONE parsing path --------------------------------------------------


def iter_raw_rows(path: Path) -> Iterator[tuple[int, list[str]]]:
    """Yield ``(row_number, cells)`` streaming — the CSV contract enforced.

    UTF-8 BOM tolerant (``utf-8-sig``), fixed comma delimiter, RFC4180
    quoting (``strict=True``), exact header match, hard row cap. Row 1 is
    the header and is consumed here; data rows start at row 2. This is a
    GENERATOR over a file handle — the file is never fully materialised.
    """
    cap = max_rows()
    with path.open("rb") as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        try:
            reader = csv.reader(text, delimiter=DELIMITER, strict=True)
            try:
                header = next(reader)
            except StopIteration:
                raise CsvContractError("Empty file.", code="empty_file") from None
            if header != list(CONTRACT_COLUMNS):
                raise CsvContractError(
                    "Header must be exactly: " + DELIMITER.join(CONTRACT_COLUMNS),
                    code="bad_header",
                )
            for row_number, cells in enumerate(reader, start=2):
                if row_number - 1 > cap:
                    raise CsvContractError(
                        f"File exceeds the {cap} row cap.",
                        code="too_many_rows",
                    )
                yield row_number, cells
        except UnicodeDecodeError as exc:
            raise CsvContractError(
                "File is not valid UTF-8.", code="bad_encoding"
            ) from exc
        except csv.Error as exc:
            raise CsvContractError(
                f"Malformed CSV: {exc}", code="malformed_csv"
            ) from exc
        finally:
            text.detach()


def validate_row(row_number: int, cells: list[str]) -> RowOutcome:
    """Validate ONE raw row against the frozen contract (M4-A3)."""
    if len(cells) != len(CONTRACT_COLUMNS):
        return RowOutcome(
            row=row_number,
            status="error",
            reason="wrong_column_count",
            data={"expected": len(CONTRACT_COLUMNS), "got": len(cells)},
        )
    for index, cell in enumerate(cells):
        # Strict (P0): the check runs on the RAW cell AND on its stripped
        # form, so a whitespace-padded " =SUM(A1)" cannot sneak past and
        # become a formula after trim. Any cell whose trimmed content
        # starts with a formula prefix is an explicit row-level error.
        if cell.startswith(FORMULA_PREFIXES) or cell.strip().startswith(
            FORMULA_PREFIXES
        ):
            return RowOutcome(
                row=row_number,
                status="error",
                reason="formula_cell",
                data={"column": CONTRACT_COLUMNS[index]},
            )
    values = {
        column: cell.strip()
        for column, cell in zip(CONTRACT_COLUMNS, cells, strict=True)
    }
    problems = field_problems(values)
    if problems:
        return RowOutcome(
            row=row_number, status="error", reason=problems[0], data=values
        )
    data: dict[str, Any] = dict(values)
    data["batch_year"] = (
        int(values["batch_year"]) if values["batch_year"] else None
    )
    # M4-A3: role is OPTIONAL in the contract — normalize once, here (P4),
    # so every writer (add / edit / import) stores the same default.
    data["role"] = values["role"] or RosterEntry.Role.MEMBER
    return RowOutcome(row=row_number, status="ok", data=data)


def field_problems(values: dict[str, str]) -> list[str]:
    """Every contract violation of one parsed row (first one is reported)."""
    problems: list[str] = []
    if not values["name"]:
        problems.append("name_required")
    elif len(values["name"]) > 255:
        problems.append("value_too_long:name")
    if values["email"] and (
        len(values["email"]) > 254 or not EMAIL_RE.match(values["email"])
    ):
        problems.append("bad_email")
    if values["phone"] and not PHONE_RE.match(values["phone"]):
        problems.append("bad_phone")
    if len(values["admission_no"]) > 64:
        problems.append("value_too_long:admission_no")
    if len(values["program"]) > 128:
        problems.append("value_too_long:program")
    if values["batch_year"]:
        if not values["batch_year"].isdigit():
            problems.append("bad_batch_year")
        elif not BATCH_YEAR_MIN <= int(values["batch_year"]) <= BATCH_YEAR_MAX:
            problems.append("bad_batch_year")
    if values["role"] and values["role"] not in ROLE_CHOICES:
        problems.append("bad_role")
    if not values["admission_no"] and not values["email"]:
        problems.append("missing_identity")
    return problems


def probe_keys(values: dict[str, Any]) -> set[str]:
    """Identity probes of one row: admission number AND email (both count)."""
    keys: set[str] = set()
    admission = str(values.get("admission_no") or "").strip().lower()
    email = str(values.get("email") or "").strip().lower()
    if admission:
        keys.add(f"adm:{admission}")
    if email:
        keys.add(f"mail:{email}")
    return keys


def _existing_keys(club: Club, probes: set[str]) -> set[str]:
    """Which probe keys already exist in this club's roster (ONE query)."""
    admissions = [key[4:] for key in probes if key.startswith("adm:")]
    emails = [key[5:] for key in probes if key.startswith("mail:")]
    if not admissions and not emails:
        return set()
    identity = Q()
    if admissions:
        identity |= Q(admission_no__in=admissions)
    if emails:
        identity |= Q(email__in=emails)
    found: set[str] = set()
    rows = (
        RosterEntry.objects.filter(club=club)
        .filter(identity)
        .values_list("admission_no", "email")
    )
    for admission_no, email in rows:
        if admission_no:
            found.add(f"adm:{admission_no.lower()}")
        if email:
            found.add(f"mail:{email.lower()}")
    return found


# --- What LEAVES the system (P0: CSV-injection neutralization) ------------


def neutralize_cell(value: Any) -> str:
    """Make ONE outgoing cell inert (``'=1+1`` can never execute).

    RFC4180 quoting does NOT stop spreadsheet apps from executing a leading
    ``=`` / ``+`` / ``-`` / ``@`` / tab — prefix-escaping with ``'`` does.
    EVERY CSV byte that leaves the system goes through this (P0).
    """
    text = "" if value is None else str(value)
    if text.startswith(FORMULA_PREFIXES):
        return "'" + text
    return text


def template_text() -> str:
    """THE import template = the frozen contract header (M4-A3 / P4)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=DELIMITER, lineterminator="\r\n")
    writer.writerow(CONTRACT_COLUMNS)
    return buffer.getvalue()


def export_lines(entries: Iterable[RosterEntry]) -> Iterator[str]:
    """Stream a roster export — every cell neutralized before quoting."""
    columns = (*CONTRACT_COLUMNS, "status")
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=DELIMITER, lineterminator="\r\n")
    writer.writerow(columns)
    yield buffer.getvalue()
    for entry in entries:
        buffer.seek(0)
        buffer.truncate()
        writer.writerow(
            [neutralize_cell(getattr(entry, column)) for column in columns]
        )
        yield buffer.getvalue()


# --- THE pipeline (dry-run = commit=False) ---------------------------------


def process_file(
    *,
    club: Club,
    source_path: Path,
    commit: bool,
    job: RosterImportJob | None = None,
) -> dict[str, Any]:
    """The single import pipeline (§4b / P4) — dry-run is this, commit=False.

    Streams rows in chunks; when committing, each chunk is one short
    transaction that also advances ``job.rows_processed`` so a crashed job
    resumes exactly at the chunk boundary (P5). Every input row ends in
    exactly one fate — ``ok`` / ``error`` (with reason) / ``duplicate`` —
    and ``total == ok + errors + duplicates`` always (W8).
    """
    if commit and job is None:
        raise ValueError("a commit run needs its job row")
    chunk = chunk_size()
    seen: set[str] = set()
    outcomes: list[dict[str, Any]] = []
    counters = {"ok": 0, "errors": 0, "duplicates": 0}
    buffer: list[RowOutcome] = []
    last_row = 0

    def flush() -> None:
        if not buffer:
            return
        probes: set[str] = set()
        for row in buffer:
            if row.status == "ok":
                probes |= probe_keys(row.data)
        existing = _existing_keys(club, probes)
        fresh: list[RosterEntry] = []
        for row in buffer:
            if row.status != "ok":
                continue
            row_probes = probe_keys(row.data)
            collision = row_probes & existing
            if collision:
                row.status = "duplicate"
                row.reason = "duplicate_existing"
                row.key = sorted(collision)[0]
                continue
            fresh.append(
                RosterEntry(
                    club=club,
                    name=str(row.data.get("name", "")),
                    email=str(row.data.get("email", "")),
                    phone=str(row.data.get("phone", "")),
                    admission_no=str(row.data.get("admission_no", "")),
                    program=str(row.data.get("program", "")),
                    batch_year=row.data.get("batch_year"),
                    role=str(row.data.get("role") or RosterEntry.Role.MEMBER),
                    status=RosterEntry.Status.ACTIVE,
                )
            )
        counts = {
            "ok": sum(1 for row in buffer if row.status == "ok"),
            "errors": sum(1 for row in buffer if row.status == "error"),
            "duplicates": sum(
                1 for row in buffer if row.status == "duplicate"
            ),
        }
        row_dicts = [row.as_dict() for row in buffer]
        if commit and fresh:
            with transaction.atomic():
                RosterEntry.objects.bulk_create(fresh, batch_size=chunk)
                _advance_job(job, counts, row_dicts, last_row)
        elif job is not None:
            with transaction.atomic():
                _advance_job(job, counts, row_dicts, last_row)
        else:
            for key in counters:
                counters[key] += counts[key]
            outcomes.extend(row_dicts)
        buffer.clear()

    for row_number, cells in iter_raw_rows(source_path):
        if job is not None and row_number <= job.rows_processed:
            continue  # already committed by an earlier chunk (P5 resume)
        last_row = row_number
        row = validate_row(row_number, cells)
        if row.status == "ok":
            row_probes = probe_keys(row.data)
            row.key = "|".join(sorted(row_probes))
            if row_probes & seen:
                row.status = "duplicate"
                row.reason = "duplicate_in_file"
            else:
                seen |= row_probes
        buffer.append(row)
        if len(buffer) >= chunk:
            flush()
    flush()

    if job is not None:
        job.status = RosterImportJob.Status.COMPLETED
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "finished_at", "updated_at"])
        return {"totals": job.totals(), "rows": list(job.row_report)}
    total = counters["ok"] + counters["errors"] + counters["duplicates"]
    return {
        "totals": {
            "total": total,
            "ok": counters["ok"],
            "errors": counters["errors"],
            "duplicates": counters["duplicates"],
        },
        "rows": outcomes,
    }


def _advance_job(
    job: RosterImportJob | None,
    counts: dict[str, int],
    row_dicts: list[dict[str, Any]],
    last_row: int,
) -> None:
    """Persist one chunk of progress (job counters + row report + cursor)."""
    if job is None:
        return
    job.ok_rows += counts["ok"]
    job.error_rows += counts["errors"]
    job.duplicate_rows += counts["duplicates"]
    job.total_rows += counts["ok"] + counts["errors"] + counts["duplicates"]
    job.rows_processed = last_row
    job.row_report = list(job.row_report) + row_dicts
    job.save(
        update_fields=[
            "ok_rows",
            "error_rows",
            "duplicate_rows",
            "total_rows",
            "rows_processed",
            "row_report",
            "updated_at",
        ]
    )


# --- Two runners, ONE pipeline (§4b / M4-A4) -------------------------------


def run_import_job(
    job: RosterImportJob, *, request: Any = None
) -> RosterImportJob:
    """Celery when a worker is wired, sync-chunked fallback otherwise.

    Only the RUNNER differs (M4-A4): same pipeline, same idempotency, same
    report. ``ROSTER_IMPORT_USE_CELERY`` + ``ROSTER_IMPORT_CELERY_TASK``
    wire the worker later with zero code change.
    """
    if getattr(settings, "ROSTER_IMPORT_USE_CELERY", False):
        task_path = str(getattr(settings, "ROSTER_IMPORT_CELERY_TASK", ""))
        runner = import_string(task_path)
        job.status = RosterImportJob.Status.RUNNING
        job.save(update_fields=["status", "updated_at"])
        runner.delay(job.pk)  # pragma: no cover - needs a live worker
        return job
    return run_sync(job, request=request)


def run_sync(
    job: RosterImportJob, *, request: Any = None
) -> RosterImportJob:
    """The free-tier runner: synchronous, chunked, resumable (M4-A4)."""
    if max_rows() > sync_limit():
        raise CsvContractError(
            "The sync runner cannot process files above "
            "ROSTER_IMPORT_SYNC_LIMIT; wire the Celery runner.",
            code="sync_limit_exceeded",
            http_status=413,
        )
    source_path = resolve_upload(job.upload_sha256, job.club)
    job.status = RosterImportJob.Status.RUNNING
    job.save(update_fields=["status", "updated_at"])
    try:
        # Contract pre-pass (P2 / W8): a file that cannot be parsed END TO END
        # is refused BEFORE the first write — a commit never lands half a file
        # and the dry-run count can never exceed what a commit accounts for.
        for _row_number, _cells in iter_raw_rows(source_path):
            pass
        process_file(
            club=job.club, source_path=source_path, commit=True, job=job
        )
    except CsvContractError as exc:
        job.status = RosterImportJob.Status.FAILED
        job.finished_at = timezone.now()
        job.row_report = list(job.row_report) + [
            {
                "row": 0,
                "status": "error",
                "reason": exc.code,
                "key": "",
                "data": {},
            }
        ]
        job.save(
            update_fields=[
                "status",
                "finished_at",
                "row_report",
                "updated_at",
            ]
        )
        raise
    job.refresh_from_db()
    return job
