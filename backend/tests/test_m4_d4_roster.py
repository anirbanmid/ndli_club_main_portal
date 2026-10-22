"""M4 D4 — dynamic student roster pins (BRIEF_M4 §3 D4).

Named pins:
* **W6 roster scoping (I1/I3/I5)** — club A admin cannot read/edit club B
  rows via ANY id swap (404, never data) · a student sees their own rows
  only · UI-hidden actions are enforced server-side regardless;
* inline edit = single-field + optimistic locking — a stale write is 409
  with the current row, never a silent overwrite (P2, "version/updated-at
  check");
* single add row (contract-validated, club-scoped uniqueness) and the
  closed status transition set (active/alumni/suspended).
"""
from __future__ import annotations

from typing import Any

from apps.audit.models import AuditLog
from apps.domain.models import Club
from apps.members.models import RosterEntry

from .m2_support import build_zone_graph
from .support import Category, SubRole, make_user
from .support import M1PinTestCase as TestCase
from .test_m4_d3_showcase import make_club_admin

ROSTER = "/api/v1/members/roster/"


def make_entry(club: Club, **overrides: Any) -> RosterEntry:
    """One roster row with sane defaults (club-scoped uniqueness applies)."""
    fields: dict[str, Any] = {
        "name": "Ashok Kumar",
        "email": "ashok@example.test",
        "admission_no": "ADM001",
        "program": "BTech",
        "batch_year": 2024,
    }
    fields.update(overrides)
    return RosterEntry.objects.create(club=club, **fields)


class RosterFixture(TestCase):
    """Two clubs + one authority each (the W6 base)."""

    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.club = self.graph["NORTH"]["club"]
        self.other_club = self.graph["WEST"]["club"]
        self.admin = make_club_admin("d4admin", self.club)
        self.other_admin = make_club_admin("d4other", self.other_club)
        self.student = make_user(
            username="d4student",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            email="d4.student@example.test",
            institution_code=self.club.institution.code,
            club_code=self.club.code,
        )
        self.entry = make_entry(self.club)
        self.other_entry = make_entry(
            self.other_club, name="Bela Singh", admission_no="ADM901",
            email="bela@example.test",
        )

    def patch_entry(
        self, pk: int, *, field: str, value: Any, version: int, **extra: Any
    ) -> Any:
        return self.client.patch(
            f"{ROSTER}{pk}/",
            data={"field": field, "value": value, "version": version, **extra},
            content_type="application/json",
        )


class W6RosterScopingTests(RosterFixture):
    """W6 — I1/I3/I5: scoping is mechanical, ids are not capabilities."""

    def test_w6_admin_reads_own_club_rows_only(self) -> None:
        self.client.force_login(self.admin)
        body = self.client.get(ROSTER).json()
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["entries"][0]["id"], self.entry.pk)
        self.assertNotIn("bela@example.test", str(body))
        self.client.logout()
        self.client.force_login(self.other_admin)
        other_body = self.client.get(ROSTER).json()
        self.assertEqual(other_body["count"], 1)
        self.assertEqual(other_body["entries"][0]["id"], self.other_entry.pk)
        self.assertNotIn("ashok@example.test", str(other_body))

    def test_w6_id_swap_edit_is_404_never_data(self) -> None:
        self.client.force_login(self.other_admin)
        response = self.patch_entry(
            self.entry.pk, field="name", value="Hijacked", version=1
        )
        self.assertEqual(response.status_code, 404)
        self.assertNotIn("ashok@example.test", response.content.decode("utf-8"))
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.name, "Ashok Kumar")
        self.assertEqual(self.entry.version, 1)

    def test_w6_id_swap_status_change_is_404(self) -> None:
        self.client.force_login(self.other_admin)
        response = self.client.post(
            f"{ROSTER}{self.entry.pk}/status/",
            data={"status": "alumni", "version": 1},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, RosterEntry.Status.ACTIVE)

    def test_w6_cross_club_and_unknown_ids_are_indistinguishable(self) -> None:
        self.client.force_login(self.other_admin)
        known = self.patch_entry(
            self.entry.pk, field="name", value="X", version=1
        )
        unknown = self.patch_entry(
            999999, field="name", value="X", version=1
        )
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.content, unknown.content)

    def test_w6_student_sees_own_rows_only(self) -> None:
        own = make_entry(
            self.club, name="Own Row", admission_no="ADM002",
            email="own@example.test", user=self.student,
        )
        self.client.force_login(self.student)
        body = self.client.get(ROSTER).json()
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["entries"][0]["id"], own.pk)
        self.assertNotIn("ashok@example.test", str(body))

    def test_w6_student_cannot_write_even_their_own_row(self) -> None:
        own = make_entry(
            self.club, name="Own Row", admission_no="ADM002",
            email="own@example.test", user=self.student,
        )
        self.client.force_login(self.student)
        for response in (
            self.patch_entry(own.pk, field="name", value="S", version=1),
            self.client.post(
                ROSTER + "add/",
                data={"name": "Sneaky", "admission_no": "ADM666"},
                content_type="application/json",
            ),
            self.client.post(
                f"{ROSTER}{own.pk}/status/",
                data={"status": "alumni", "version": 1},
                content_type="application/json",
            ),
        ):
            self.assertIn(response.status_code, (401, 403))
        own.refresh_from_db()
        self.assertEqual(own.name, "Own Row")
        self.assertFalse(
            RosterEntry.objects.filter(admission_no="ADM666").exists()
        )

    def test_w6_student_never_reads_other_students_rows(self) -> None:
        make_entry(
            self.club, name="Classmate", admission_no="ADM003",
            email="classmate@example.test",
        )
        self.client.force_login(self.student)
        body = self.client.get(ROSTER).json()
        self.assertEqual(body["count"], 0)

    def test_w6_upload_id_is_club_scoped(self) -> None:
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.client.force_login(self.admin)
        upload = self.client.post(
            ROSTER + "import/upload/",
            {"file": SimpleUploadedFile("a.csv", b"name,admission_no\nA,ADM1\n")},
        )
        self.assertEqual(upload.status_code, 200, upload.content)
        upload_id = upload.json()["upload_id"]
        self.client.logout()
        self.client.force_login(self.other_admin)
        response = self.client.post(
            ROSTER + "import/dry-run/",
            data={"upload_id": upload_id},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "upload_not_found")

    def test_w6_import_job_view_is_scoped(self) -> None:
        from apps.members.models import RosterImportJob

        job = RosterImportJob.objects.create(
            club=self.club, idempotency_key="CLB-DU-CULT:aa", upload_sha256="aa"
        )
        self.client.force_login(self.other_admin)
        response = self.client.get(f"{ROSTER}import/jobs/{job.pk}/")
        self.assertEqual(response.status_code, 404)
        self.assertNotIn("CLB-DU-CULT", response.content.decode("utf-8"))


class InlineEditTests(RosterFixture):
    """Single-field inline edit behind the optimistic lock (P2)."""

    def setUp(self) -> None:
        super().setUp()
        self.client.force_login(self.admin)

    def test_single_field_edit_bumps_version_and_exposes_clock(self) -> None:
        response = self.patch_entry(
            self.entry.pk, field="name", value="Ashok K", version=1
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["name"], "Ashok K")
        self.assertEqual(body["version"], 2)
        self.assertIn("updated_at", body)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.name, "Ashok K")
        self.assertEqual(self.entry.version, 2)

    def test_stale_version_is_409_and_never_silently_overwrites(self) -> None:
        self.patch_entry(self.entry.pk, field="name", value="First", version=1)
        stale = self.patch_entry(
            self.entry.pk, field="name", value="Second", version=1
        )
        self.assertEqual(stale.status_code, 409)
        body = stale.json()
        self.assertEqual(body["code"], "version_conflict")
        self.assertEqual(body["current"]["version"], 2)
        self.assertEqual(body["current"]["name"], "First")
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.name, "First")

    def test_updated_at_cross_check_mismatch_is_409(self) -> None:
        response = self.patch_entry(
            self.entry.pk,
            field="name",
            value="Late",
            version=1,
            updated_at="2000-01-01T00:00:00+00:00",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "version_conflict")
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.name, "Ashok Kumar")

    def test_updated_at_cross_check_match_is_accepted(self) -> None:
        self.entry.refresh_from_db()
        response = self.patch_entry(
            self.entry.pk,
            field="name",
            value="On Time",
            version=1,
            updated_at=self.entry.updated_at.isoformat(),
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["name"], "On Time")

    def test_unreadable_updated_at_is_400(self) -> None:
        response = self.patch_entry(
            self.entry.pk, field="name", value="X", version=1, updated_at=42
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "bad_updated_at")

    def test_version_is_required(self) -> None:
        response = self.client.patch(
            f"{ROSTER}{self.entry.pk}/",
            data={"field": "name", "value": "X"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "version_required")

    def test_exactly_one_field_per_request(self) -> None:
        response = self.client.patch(
            f"{ROSTER}{self.entry.pk}/",
            data={"field": "name", "value": "X", "version": 1, "email": "y@e.test"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "single_field_only")

    def test_status_cannot_move_via_the_inline_edit(self) -> None:
        response = self.patch_entry(
            self.entry.pk, field="status", value="alumni", version=1
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "field_not_editable")

    def test_formula_cells_are_rejected_even_whitespace_padded(self) -> None:
        for value in ("=SUM(A1)", " =SUM(A1)", "@cmd", "+49 170", "\t=1+1"):
            with self.subTest(value=repr(value)):
                response = self.patch_entry(
                    self.entry.pk, field="name", value=value, version=1
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["code"], "formula_cell")
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.name, "Ashok Kumar")

    def test_email_collision_is_409(self) -> None:
        make_entry(
            self.club, name="Other", admission_no="ADM002",
            email="other@example.test",
        )
        response = self.patch_entry(
            self.entry.pk, field="email", value="other@example.test", version=1
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "duplicate_entry")

    def test_identity_reuse_across_clubs_is_allowed(self) -> None:
        self.client.force_login(self.other_admin)
        response = self.patch_entry(
            self.other_entry.pk,
            field="admission_no",
            value="ADM001",
            version=1,
        )
        self.assertEqual(response.status_code, 200, response.content)

    def test_batch_year_and_role_are_contract_validated(self) -> None:
        year = self.patch_entry(
            self.entry.pk, field="batch_year", value="2024", version=1
        )
        self.assertEqual(year.status_code, 200, year.content)
        self.assertEqual(year.json()["batch_year"], 2024)
        bad = self.patch_entry(
            self.entry.pk, field="batch_year", value="20x4", version=2
        )
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(bad.json()["code"], "bad_batch_year")
        # a contract rejection writes nothing, so it must NOT burn the
        # version — the client can retry the corrected value at the same
        # version (only real writes bump, P2 one-lock-truth).
        blank_role = self.patch_entry(
            self.entry.pk, field="role", value="", version=2
        )
        self.assertEqual(blank_role.status_code, 200, blank_role.content)
        self.assertEqual(blank_role.json()["role"], RosterEntry.Role.MEMBER)

    def test_edit_is_audited(self) -> None:
        self.patch_entry(self.entry.pk, field="name", value="Audited", version=1)
        self.assertTrue(
            AuditLog.objects.filter(action="roster.entry.updated").exists()
        )


class AddRowTests(RosterFixture):
    """The single add row — same frozen contract as the CSV (P4)."""

    def setUp(self) -> None:
        super().setUp()
        self.client.force_login(self.admin)

    def add(self, **payload: Any) -> Any:
        return self.client.post(
            ROSTER + "add/", data=payload, content_type="application/json"
        )

    def test_add_creates_an_active_member_row(self) -> None:
        response = self.add(
            name="New Student", email="new@example.test",
            admission_no="ADM777", batch_year="2025",
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["status"], RosterEntry.Status.ACTIVE)
        self.assertEqual(body["role"], RosterEntry.Role.MEMBER)
        self.assertEqual(body["version"], 1)
        self.assertEqual(body["batch_year"], 2025)

    def test_add_rejects_unknown_fields(self) -> None:
        response = self.add(name="X", admission_no="ADM1", status="alumni")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "unknown_field")

    def test_add_validates_the_contract(self) -> None:
        missing_name = self.add(admission_no="ADM1")
        self.assertEqual(missing_name.status_code, 400)
        self.assertEqual(missing_name.json()["code"], "name_required")
        no_identity = self.add(name="No Identity")
        self.assertEqual(no_identity.status_code, 400)
        self.assertEqual(no_identity.json()["code"], "missing_identity")

    def test_add_refuses_duplicates_inside_the_club(self) -> None:
        response = self.add(name="Twin", admission_no="ADM001")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "duplicate_entry")

    def test_add_allows_same_identity_in_another_club(self) -> None:
        self.client.force_login(self.other_admin)
        response = self.add(name="Twin", admission_no="ADM001")
        self.assertEqual(response.status_code, 201, response.content)

    def test_add_is_audited(self) -> None:
        self.add(name="Audited Add", admission_no="ADM888")
        self.assertTrue(
            AuditLog.objects.filter(action="roster.entry.created").exists()
        )


class StatusManagementTests(RosterFixture):
    """The closed transition set (D4 §3: active/alumni/suspended)."""

    def setUp(self) -> None:
        super().setUp()
        self.client.force_login(self.admin)

    def move(self, pk: int, status: str, version: int) -> Any:
        return self.client.post(
            f"{ROSTER}{pk}/status/",
            data={"status": status, "version": version},
            content_type="application/json",
        )

    def test_valid_transition_walk(self) -> None:
        steps = (
            (RosterEntry.Status.SUSPENDED, 2),
            (RosterEntry.Status.ACTIVE, 3),
            (RosterEntry.Status.ALUMNI, 4),
        )
        version = 1
        for target, expected_version in steps:
            with self.subTest(target=target):
                response = self.move(self.entry.pk, target, version)
                self.assertEqual(response.status_code, 200, response.content)
                self.assertEqual(response.json()["status"], target)
                self.assertEqual(response.json()["version"], expected_version)
                version = expected_version

    def test_alumni_is_terminal(self) -> None:
        self.move(self.entry.pk, RosterEntry.Status.ALUMNI, 1)
        for target in (
            RosterEntry.Status.ACTIVE, RosterEntry.Status.SUSPENDED,
            RosterEntry.Status.ALUMNI,
        ):
            with self.subTest(target=target):
                response = self.move(self.entry.pk, target, 2)
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json()["code"], "invalid_transition")

    def test_unknown_target_is_refused(self) -> None:
        response = self.move(self.entry.pk, "retired", 1)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "invalid_transition")

    def test_stale_version_on_status_is_409(self) -> None:
        self.move(self.entry.pk, RosterEntry.Status.SUSPENDED, 1)
        response = self.move(self.entry.pk, RosterEntry.Status.ACTIVE, 1)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "version_conflict")
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, RosterEntry.Status.SUSPENDED)

    def test_status_change_is_audited(self) -> None:
        self.move(self.entry.pk, RosterEntry.Status.SUSPENDED, 1)
        self.assertTrue(
            AuditLog.objects.filter(action="roster.status.changed").exists()
        )
