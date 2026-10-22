"""M4 D4 — bulk CSV battery (BRIEF_M4 §3 D4 / §4b): W7 + W8 + P0.

Named pins:
* **W7 CSV battery** — malformed CSV (ragged rows, bad encoding, formula
  cells) → clean row-level errors · duplicates → dedup + report · very
  large file (10k rows) → cap/stream behaviour proven · re-run idempotent
  (byte-identical outcome);
* **W8 zero silent loss** — dry-run count == committed + rejected +
  duplicate, EVERY input row accounted for, and a file that cannot be
  parsed end-to-end is refused with nothing written;
* **P0 CSV-injection neutralization** — every CSV cell that leaves the
  system (export) is prefix-escaped; formula cells in import are rejected
  as explicit row errors (strict: whitespace-padded too).
"""
from __future__ import annotations

import csv
import hashlib
import inspect
import io
import json
import tempfile
from pathlib import Path
from typing import Any, cast

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from apps.audit.models import AuditLog
from apps.members import roster_csv
from apps.members.models import RosterEntry, RosterImportJob

from .m2_support import build_zone_graph
from .support import M1PinTestCase as TestCase
from .test_m4_d3_showcase import make_club_admin

ROSTER = "/api/v1/members/roster/"
UPLOAD = ROSTER + "import/upload/"
DRY_RUN = ROSTER + "import/dry-run/"
COMMIT = ROSTER + "import/jobs/"
COMMIT_URL = ROSTER + "import/commit/"
TEMPLATE = ROSTER + "import/template/"
EXPORT = ROSTER + "export/"

#: One club-scoped import root per test process (hash-named files only).
IMPORT_ROOT = Path(tempfile.mkdtemp(prefix="d4-roster-imports-"))

HEADER_LINE = "name,email,phone,admission_no,program,batch_year,role"


def csv_bytes(
    rows: list[list[str]],
    *,
    bom: bool = False,
    header: list[str] | None = None,
    delimiter: str = ",",
) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=delimiter, lineterminator="\r\n")
    writer.writerow(header if header is not None else roster_csv.CONTRACT_COLUMNS)
    for row in rows:
        writer.writerow(row)
    data = buffer.getvalue().encode("utf-8")
    return b"\xef\xbb\xbf" + data if bom else data


def ok_row(i: int) -> list[str]:
    return [
        f"Student {i}",
        f"s{i}@example.test",
        "",
        f"ADM{i:04d}",
        "BTech",
        "2024",
        "member",
    ]


@override_settings(ROSTER_IMPORT_ROOT=IMPORT_ROOT)
class CsvFixture(TestCase):
    """Club + authority + the upload helpers every battery shares."""

    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.club = self.graph["NORTH"]["club"]
        self.admin = make_club_admin("d4csvadmin", self.club)
        self.client.force_login(self.admin)

    def upload(self, data: bytes, name: str = "roster.csv") -> Any:
        return self.client.post(
            UPLOAD, {"file": SimpleUploadedFile(name, data)}
        )

    def upload_ok(self, data: bytes, name: str = "roster.csv") -> str:
        response = self.upload(data, name)
        self.assertEqual(response.status_code, 200, response.content)
        return str(response.json()["upload_id"])

    def dry_run(self, upload_id: str) -> Any:
        return self.client.post(
            DRY_RUN,
            data={"upload_id": upload_id},
            content_type="application/json",
        )

    def commit(self, upload_id: str) -> Any:
        return self.client.post(
            COMMIT_URL,
            data={"upload_id": upload_id},
            content_type="application/json",
        )


class TemplateContractTests(CsvFixture):
    """Template download = the frozen contract object (M4-A3 / P4)."""

    def test_template_is_the_frozen_header_only(self) -> None:
        response = self.client.get(TEMPLATE)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            response["Content-Type"].startswith("text/csv"), response["Content-Type"]
        )
        self.assertIn("attachment", response["Content-Disposition"])
        text = response.content.decode("utf-8-sig")
        self.assertEqual(text.splitlines(), [HEADER_LINE])


class UploadHardeningTests(CsvFixture):
    """Hash-stored staging, caps, extension allowlist (P0)."""

    def test_stored_name_is_the_content_hash_not_the_user_filename(self) -> None:
        data = csv_bytes([ok_row(1)])
        upload_id = self.upload_ok(data, name="my roster (final).csv")
        self.assertEqual(upload_id, hashlib.sha256(data).hexdigest())
        club_dir = IMPORT_ROOT / self.club.code
        stored = sorted(path.name for path in club_dir.iterdir())
        self.assertEqual(stored, [f"{upload_id}.csv"])
        self.assertFalse((club_dir / "my roster (final).csv").exists())

    def test_non_csv_extension_is_refused(self) -> None:
        response = self.upload(b"name\nx\n", name="roster.txt")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "unsupported_file")

    def test_oversize_upload_is_refused_before_any_parsing(self) -> None:
        response = self.upload(b"x" * (roster_csv.max_bytes() + 1))
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["code"], "file_too_large")

    def test_empty_upload_is_refused(self) -> None:
        response = self.upload(b"")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "empty_file")

    def test_upload_is_audited(self) -> None:
        self.upload_ok(csv_bytes([ok_row(1)]))
        self.assertTrue(
            AuditLog.objects.filter(action="roster.import.uploaded").exists()
        )


class DryRunPreviewTests(CsvFixture):
    """Dry-run = THE pipeline with commit=False — NOTHING is written."""

    def test_preview_writes_nothing_and_reports_every_row(self) -> None:
        data = csv_bytes(
            [
                ok_row(1),
                ["", "", "", "ADM0002", "BTech", "2024", "member"],
                ["=SUM(A1)", "e@x.test", "", "ADM3", "BTech", "2024", "member"],
            ]
        )
        response = self.dry_run(self.upload_ok(data))
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertFalse(body["committed"])
        self.assertEqual(
            body["totals"],
            {"total": 3, "ok": 1, "errors": 2, "duplicates": 0},
        )
        reasons = {row["row"]: row["reason"] for row in body["rows"]}
        self.assertEqual(reasons[3], "name_required")
        self.assertEqual(reasons[4], "formula_cell")
        self.assertEqual(RosterEntry.objects.count(), 0)
        self.assertEqual(RosterImportJob.objects.count(), 0)

    def test_totals_keys_and_identity(self) -> None:
        response = self.dry_run(self.upload_ok(csv_bytes([ok_row(1)])))
        totals = response.json()["totals"]
        self.assertEqual(totals["total"], totals["ok"] + totals["errors"])
        self.assertIn("duplicates", totals)

    def test_bom_tolerant_utf8(self) -> None:
        response = self.dry_run(self.upload_ok(csv_bytes([ok_row(1)], bom=True)))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["totals"]["ok"], 1)

    def test_bad_header_is_a_clean_contract_error(self) -> None:
        data = csv_bytes(
            [ok_row(1)],
            header=[
                "Name", "email", "phone", "admission_no",
                "program", "batch_year", "role",
            ],
        )
        response = self.dry_run(self.upload_ok(data))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "bad_header")

    def test_delimiter_sniffing_is_rejected(self) -> None:
        data = csv_bytes([ok_row(1)], delimiter=";")
        response = self.dry_run(self.upload_ok(data))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "bad_header")

    def test_bad_encoding_is_a_clean_contract_error(self) -> None:
        data = csv_bytes([ok_row(1)]) + b"\xff\xfe garbage row\n"
        response = self.dry_run(self.upload_ok(data))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "bad_encoding")
        self.assertEqual(RosterEntry.objects.count(), 0)

    def test_unknown_upload_is_404(self) -> None:
        response = self.dry_run("0" * 64)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "upload_not_found")

    def test_malformed_upload_id_is_a_clean_400(self) -> None:
        response = self.dry_run("not-a-hash")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "bad_upload_id")


class W7MalformedRowTests(CsvFixture):
    """Row-level errors — the file keeps flowing, nobody is dropped."""

    def test_ragged_row_is_row_level(self) -> None:
        data = csv_bytes(
            [ok_row(1), ["only", "six", "cells", "here", "now", "x"], ok_row(3)]
        )
        response = self.dry_run(self.upload_ok(data))
        body = response.json()
        self.assertEqual(
            body["totals"],
            {"total": 3, "ok": 2, "errors": 1, "duplicates": 0},
        )
        row = body["rows"][1]
        self.assertEqual(row["row"], 3)
        self.assertEqual(row["reason"], "wrong_column_count")

    def test_formula_cells_are_rejected_per_row_strictly(self) -> None:
        evil_names = ["=1+1", "+49 170", "-2+3", "@cmd", "\t=1+1", " =SUM(A1)"]
        rows = [
            [name, f"s{i}@example.test", "", f"ADM{i}", "BTech", "2024", "member"]
            for i, name in enumerate(evil_names, start=1)
        ]
        rows.append(ok_row(100))
        response = self.dry_run(self.upload_ok(csv_bytes(rows)))
        body = response.json()
        self.assertEqual(body["totals"]["errors"], len(evil_names))
        self.assertEqual(body["totals"]["ok"], 1)
        for row in body["rows"]:
            if row["status"] == "error":
                self.assertEqual(row["reason"], "formula_cell")

    def test_formula_phone_is_rejected_by_the_same_strict_rule(self) -> None:
        """Documented behaviour: ANY formula-prefixed cell is an error row."""
        row = [
            "Student X", "sx@example.test", "+91 98765 43210",
            "ADMX", "BTech", "2024", "member",
        ]
        response = self.dry_run(self.upload_ok(csv_bytes([row])))
        self.assertEqual(
            response.json()["totals"],
            {"total": 1, "ok": 0, "errors": 1, "duplicates": 0},
        )
        self.assertEqual(response.json()["rows"][0]["reason"], "formula_cell")

    def test_field_errors_are_row_level_with_reasons(self) -> None:
        rows = [
            ["Bad Email", "not-an-email", "", "ADM1", "BTech", "2024", "member"],
            ["Bad Year", "y@example.test", "", "ADM2", "BTech", "1800", "member"],
            ["Bad Role", "r@example.test", "", "ADM3", "BTech", "2024", "boss"],
            ["No Identity", "", "", "", "BTech", "2024", "member"],
        ]
        response = self.dry_run(self.upload_ok(csv_bytes(rows)))
        body = response.json()
        self.assertEqual(
            body["totals"],
            {"total": 4, "ok": 0, "errors": 4, "duplicates": 0},
        )
        reasons = [row["reason"] for row in body["rows"]]
        self.assertEqual(
            reasons,
            ["bad_email", "bad_batch_year", "bad_role", "missing_identity"],
        )


class W7DuplicateTests(CsvFixture):
    """Dedup + report: in-file duplicates and duplicates vs the roster."""

    def test_in_file_duplicates_are_deduped_and_reported(self) -> None:
        rows = [ok_row(1), ok_row(1), ok_row(2)]
        rows[1][0] = "Student One Again"  # same identity, different name
        response = self.dry_run(self.upload_ok(csv_bytes(rows)))
        body = response.json()
        self.assertEqual(
            body["totals"],
            {"total": 3, "ok": 2, "errors": 0, "duplicates": 1},
        )
        dup = body["rows"][1]
        self.assertEqual(dup["reason"], "duplicate_in_file")
        self.assertIn("adm:adm0001", dup["key"])

    def test_duplicates_against_the_roster_are_reported(self) -> None:
        RosterEntry.objects.create(
            club=self.club, name="Existing", admission_no="ADM0001",
            email="s1@example.test",
        )
        response = self.dry_run(self.upload_ok(csv_bytes([ok_row(1), ok_row(2)])))
        body = response.json()
        self.assertEqual(
            body["totals"],
            {"total": 2, "ok": 1, "errors": 0, "duplicates": 1},
        )
        self.assertEqual(body["rows"][0]["reason"], "duplicate_existing")

    def test_cross_identity_duplicate_is_caught_on_either_key(self) -> None:
        """Same email, NEW admission number still counts as a duplicate."""
        RosterEntry.objects.create(
            club=self.club, name="Existing", admission_no="ADMZZZ",
            email="s1@example.test",
        )
        response = self.dry_run(self.upload_ok(csv_bytes([ok_row(1)])))
        self.assertEqual(response.json()["totals"]["duplicates"], 1)


class W7LargeFileTests(CsvFixture):
    """Very large files: hard cap + streaming behaviour (W7)."""

    def test_ten_thousand_rows_pass_the_cap(self) -> None:
        data = csv_bytes([ok_row(i) for i in range(1, 10_001)])
        response = self.dry_run(self.upload_ok(data))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["totals"]["ok"], 10_000)

    def test_row_10001_refuses_the_file_without_writing(self) -> None:
        data = csv_bytes([ok_row(i) for i in range(1, 10_002)])
        upload_id = self.upload_ok(data)
        preview = self.dry_run(upload_id)
        self.assertEqual(preview.status_code, 400)
        self.assertEqual(preview.json()["code"], "too_many_rows")
        commit = self.commit(upload_id)
        self.assertEqual(commit.status_code, 400)
        self.assertEqual(commit.json()["code"], "too_many_rows")
        # W8: an unparsable file lands NOTHING and fails explicitly.
        self.assertEqual(RosterEntry.objects.count(), 0)
        job = RosterImportJob.objects.get(
            idempotency_key=f"{self.club.code}:{upload_id}"
        )
        self.assertEqual(job.status, RosterImportJob.Status.FAILED)
        self.assertEqual(job.total_rows, 0)
        self.assertEqual(job.row_report[0]["reason"], "too_many_rows")

    def test_parse_is_streaming_not_buffered(self) -> None:
        self.assertTrue(inspect.isgeneratorfunction(roster_csv.iter_raw_rows))
        iterator = roster_csv.iter_raw_rows(
            roster_csv.resolve_upload(self.upload_ok(csv_bytes([ok_row(1)])), self.club)
        )
        self.assertTrue(inspect.isgenerator(iterator))


class CommitAndIdempotencyTests(CsvFixture):
    """Commit = chunked writes; re-running the same file is a no-op (W7)."""

    def test_commit_writes_rows_with_contract_defaults(self) -> None:
        rows = [["New Student", "n@example.test", "", "ADM0009", "BTech", "2025", ""]]
        body = self.commit(self.upload_ok(csv_bytes(rows))).json()
        self.assertEqual(body["status"], RosterImportJob.Status.COMPLETED)
        self.assertEqual(
            body["totals"],
            {"total": 1, "ok": 1, "errors": 0, "duplicates": 0},
        )
        entry = RosterEntry.objects.get(admission_no="ADM0009")
        self.assertEqual(entry.status, RosterEntry.Status.ACTIVE)
        self.assertEqual(entry.role, RosterEntry.Role.MEMBER)
        self.assertEqual(entry.version, 1)

    def test_re_committing_the_same_file_is_a_byte_identical_noop(self) -> None:
        upload_id = self.upload_ok(csv_bytes([ok_row(1), ok_row(2)]))
        first = self.commit(upload_id).json()
        self.assertFalse(first["replayed"])
        count_after_first = RosterEntry.objects.count()
        second = self.commit(upload_id).json()
        self.assertTrue(second["replayed"])
        self.assertEqual(
            json.dumps(first["totals"], sort_keys=True),
            json.dumps(second["totals"], sort_keys=True),
        )
        self.assertEqual(
            json.dumps(first["row_report"], sort_keys=True),
            json.dumps(second["row_report"], sort_keys=True),
        )
        self.assertEqual(RosterEntry.objects.count(), count_after_first)

    def test_re_uploading_identical_bytes_replays_the_same_job(self) -> None:
        data = csv_bytes([ok_row(1)])
        first_id = self.upload_ok(data)
        self.commit(first_id).json()
        second_id = self.upload_ok(data)
        self.assertEqual(second_id, first_id)
        replay = self.commit(second_id).json()
        self.assertTrue(replay["replayed"])
        self.assertEqual(RosterEntry.objects.count(), 1)

    def test_changed_file_is_a_new_job_that_dedupes_not_duplicates(self) -> None:
        self.commit(self.upload_ok(csv_bytes([ok_row(1)]))).json()
        changed = csv_bytes([ok_row(1), ok_row(2)])
        body = self.commit(self.upload_ok(changed)).json()
        self.assertFalse(body["replayed"])
        self.assertEqual(body["totals"]["duplicates"], 1)
        self.assertEqual(body["totals"]["ok"], 1)
        self.assertEqual(RosterEntry.objects.count(), 2)

    def test_commit_is_audited(self) -> None:
        self.commit(self.upload_ok(csv_bytes([ok_row(1)]))).json()
        self.assertTrue(
            AuditLog.objects.filter(action="roster.import.committed").exists()
        )

    def test_job_endpoint_reports_the_row_level_report(self) -> None:
        upload_id = self.upload_ok(csv_bytes([ok_row(1)]))
        job_id = self.commit(upload_id).json()["id"]
        body = self.client.get(f"{COMMIT}{job_id}/").json()
        self.assertEqual(body["totals"]["ok"], 1)
        self.assertEqual(body["rows_processed"], 2)
        self.assertEqual(len(body["row_report"]), 1)


class W8ZeroSilentLossTests(CsvFixture):
    """W8: dry-run count == committed + rejected + duplicate, every row."""

    def test_every_row_lands_as_success_or_an_explicit_error(self) -> None:
        RosterEntry.objects.create(
            club=self.club, name="Existing", admission_no="ADM0000",
            email="existing@example.test",
        )
        rows = [
            ok_row(1),  # ok
            ok_row(2),  # ok
            ["only", "six", "cells", "here", "now", "x"],  # error
            ["=SUM(A1)", "e1@example.test", "", "ADM0004", "BTech", "2024", "member"],  # noqa: E501
            # dup in file
            ["Student 1 again", "s1@example.test", "", "ADM0001", "B", "2024", "member"],  # noqa: E501
            ok_row(6),  # ok
            # dup vs roster
            ["Existing", "existing@example.test", "", "ADM0000", "B", "2024", "member"],  # noqa: E501
            ["Bad Email", "nope", "", "ADM0008", "B", "2024", "member"],  # error
        ]
        upload_id = self.upload_ok(csv_bytes(rows))
        preview = self.dry_run(upload_id).json()
        committed = self.commit(upload_id).json()

        # dry-run count == commit count (same pipeline, P4).
        self.assertEqual(preview["totals"], committed["totals"])
        totals = committed["totals"]
        # every input row accounted for
        self.assertEqual(totals["total"], len(rows))
        self.assertEqual(
            totals["total"],
            totals["ok"] + totals["errors"] + totals["duplicates"],
        )
        self.assertEqual(len(committed["row_report"]), len(rows))
        reported_rows = sorted(row["row"] for row in committed["row_report"])
        self.assertEqual(reported_rows, list(range(2, 2 + len(rows))))
        fates = {row["status"] for row in committed["row_report"]}
        self.assertEqual(fates, {"ok", "error", "duplicate"})
        self.assertEqual(RosterEntry.objects.count(), 1 + totals["ok"])

    def test_chunked_writes_keep_the_identity_across_boundaries(self) -> None:
        rows = [ok_row(i) for i in range(1, 8)]
        rows[4] = ["six", "cells", "only", "here", "x", "y"]  # error at row 6
        with self.settings(ROSTER_IMPORT_CHUNK_SIZE=2):
            body = self.commit(self.upload_ok(csv_bytes(rows))).json()
        totals = body["totals"]
        self.assertEqual(
            totals["total"],
            totals["ok"] + totals["errors"] + totals["duplicates"],
        )
        self.assertEqual(totals["total"], 7)


class P5ResumeTests(CsvFixture):
    """P5: the job cursor resumes exactly at a chunk boundary."""

    def test_rows_processed_cursor_skips_committed_chunks(self) -> None:
        data = csv_bytes([ok_row(1), ok_row(2), ok_row(3), ok_row(4)])
        upload_id = self.upload_ok(data)
        job = RosterImportJob.objects.create(
            club=self.club,
            created_by=self.admin,
            idempotency_key=f"{self.club.code}:{upload_id}",
            upload_sha256=upload_id,
            rows_processed=3,  # rows 2-3 already committed by an earlier run
        )
        with self.settings(ROSTER_IMPORT_CHUNK_SIZE=2):
            roster_csv.run_sync(job)
        job.refresh_from_db()
        self.assertEqual(job.status, RosterImportJob.Status.COMPLETED)
        self.assertEqual(job.total_rows, 2)  # rows 4-5 only
        self.assertEqual(
            sorted(row["row"] for row in job.row_report), [4, 5]
        )

    def test_completed_job_replays_without_double_writing(self) -> None:
        upload_id = self.upload_ok(csv_bytes([ok_row(1), ok_row(2)]))
        job = RosterImportJob.objects.create(
            club=self.club,
            created_by=self.admin,
            idempotency_key=f"{self.club.code}:{upload_id}",
            upload_sha256=upload_id,
        )
        roster_csv.run_sync(job)
        job.refresh_from_db()
        first_totals, first_rows = job.totals(), job.row_report
        roster_csv.run_sync(job)  # cursor covers the file: pure no-op
        job.refresh_from_db()
        self.assertEqual(job.totals(), first_totals)
        self.assertEqual(job.row_report, first_rows)
        self.assertEqual(RosterEntry.objects.count(), 2)


class P0ExportNeutralizationTests(CsvFixture):
    """P0: EVERY CSV cell that leaves the system is formula-neutralized."""

    def test_export_neutralizes_every_formula_prefix(self) -> None:
        RosterEntry.objects.create(
            club=self.club, name="=SUM(A1)", email="e1@example.test",
            admission_no="ADM1",
        )
        RosterEntry.objects.create(
            club=self.club, name="Plain Jane", email="j@example.test",
            admission_no="ADM2", phone="+91 98765 43210",
        )
        RosterEntry.objects.create(
            club=self.club, name="@cmd", email="c@example.test",
            admission_no="ADM3", program="-moz-box",
        )
        response = self.client.get(EXPORT)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Type"].startswith("text/csv"))
        self.assertIn("attachment", response["Content-Disposition"])
        lines = (
            b"".join(cast(Any, response).streaming_content)
            .decode("utf-8-sig")
            .splitlines()
        )
        self.assertEqual(
            lines[0],
            "name,email,phone,admission_no,program,batch_year,role,status",
        )
        parsed = list(csv.reader(lines))
        by_name = {row[0]: row for row in parsed[1:]}
        self.assertIn("'=SUM(A1)", by_name)
        self.assertIn("'@cmd", by_name)
        self.assertEqual(by_name["'@cmd"][4], "'-moz-box")
        self.assertEqual(by_name["Plain Jane"][2], "'+91 98765 43210")
        # no cell that leaves the system starts with a live formula prefix
        for row in parsed[1:]:
            for cell in row:
                self.assertFalse(
                    cell.startswith(roster_csv.FORMULA_PREFIXES),
                    f"unescaped formula cell escaped the export: {cell!r}",
                )

    def test_export_is_streaming(self) -> None:
        self.assertTrue(inspect.isgenerator(roster_csv.export_lines(iter([]))))

    def test_neutralize_cell_unit(self) -> None:
        self.assertEqual(roster_csv.neutralize_cell("=1+1"), "'=1+1")
        self.assertEqual(roster_csv.neutralize_cell("+49"), "'+49")
        self.assertEqual(roster_csv.neutralize_cell("-2"), "'-2")
        self.assertEqual(roster_csv.neutralize_cell("@x"), "'@x")
        self.assertEqual(roster_csv.neutralize_cell("\tx"), "'\tx")
        self.assertEqual(roster_csv.neutralize_cell("\rx"), "'\rx")
        self.assertEqual(roster_csv.neutralize_cell("plain"), "plain")
        self.assertEqual(roster_csv.neutralize_cell(""), "")
        self.assertEqual(roster_csv.neutralize_cell(None), "")
        self.assertEqual(roster_csv.neutralize_cell(2024), "2024")
