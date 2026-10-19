"""D1 — schema pins (BRIEF_M2.md §4): FKs, unique keys, indexes, migrations.

Named pins:
* the Profile scope swap keeps the legacy column names AND the code-string
  values (``to_field="code"`` + ``db_constraint=False`` — M2-A5);
* every designed FK/unique/index exists in the REAL database schema on both
  engines (introspected, not asserted from model metadata alone);
* every migration is reversible and the backwards direction preserves the
  profile rows (actually executed, both directions);
* the migration state matches the models exactly (no drift).
"""
from __future__ import annotations

from typing import Any, cast

from django.core.management import call_command
from django.db import connection
from django.test import TransactionTestCase

from apps.accounts.models import Category, Profile, SubRole
from apps.domain.models import (
    AuthorityAssignment,
    Club,
    District,
    Institution,
    Membership,
    OfficerAssignment,
    State,
    Zone,
)

from .support import M1PinTestCase as TestCase
from .support import make_profile


class ScopeSwapSchemaTests(TestCase):
    def test_profile_scope_fields_are_soft_code_relations(self) -> None:
        field_specs = {
            "institution": ("institution_code", "domain.Institution"),
            "club": ("club_code", "domain.Club"),
            "zone": ("zone_code", "domain.Zone"),
            "state": ("state_code", "domain.State"),
        }
        for name, (column, target) in field_specs.items():
            with self.subTest(field=name):
                field = cast(Any, Profile._meta.get_field(name))
                self.assertTrue(field.is_relation, name)
                self.assertEqual(field.db_column, column)
                self.assertEqual(field.target_field.name, "code")
                self.assertFalse(field.db_constraint, name)
                self.assertEqual(f"{field.remote_field.model._meta.label}", target)

    def test_code_string_compat_properties_keep_m1_semantics(self) -> None:
        _user, profile = make_profile(
            username="d1compat",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            institution_code="INST-DU-001",
            club_code="CLB-DU-CULT",
            zone_code="NORTH",
            state_code="DELHI",
        )
        self.assertEqual(profile.zone_code, "NORTH")
        self.assertEqual(profile.state_code, "DELHI")
        self.assertEqual(profile.institution_code, "INST-DU-001")
        self.assertEqual(profile.club_code, "CLB-DU-CULT")

    def test_domain_unique_keys_are_in_the_database(self) -> None:
        expected = {
            Zone: ["code"],
            State: ["code"],
            Institution: ["code", "legacy_id"],
            Club: ["code"],
        }
        for model, columns in expected.items():
            table = model._meta.db_table
            constraints = connection.introspection.get_constraints(
                connection.cursor(), table
            )
            unique_columns = {
                tuple(info["columns"])
                for info in constraints.values()
                if info["unique"] and info["columns"]
            }
            for column in columns:
                with self.subTest(model=model.__name__, column=column):
                    self.assertIn((column,), unique_columns)

    def test_domain_composite_constraints_are_in_the_database(self) -> None:
        table = Membership._meta.db_table
        constraints = connection.introspection.get_constraints(
            connection.cursor(), table
        )
        unique_columns = {
            tuple(sorted(info["columns"]))
            for info in constraints.values()
            if info["unique"] and info["columns"]
        }
        self.assertIn(("club_id", "user_id"), unique_columns)

    def test_query_pattern_indexes_exist_on_both_engines(self) -> None:
        checks = {
            Institution._meta.db_table: (("state_id", "district_id", "name"),),
            Membership._meta.db_table: (("club_id", "status"),),
            OfficerAssignment._meta.db_table: (("state_id", "from_date"),),
            AuthorityAssignment._meta.db_table: (
                ("club_id", "tier", "from_date"),
                ("user_id",),
            ),
            Profile._meta.db_table: (
                ("institution_code",),
                ("club_code",),
                ("zone_code",),
                ("state_code",),
            ),
        }
        for table, wanted in checks.items():
            constraints = connection.introspection.get_constraints(
                connection.cursor(), table
            )
            indexed = {
                tuple(info["columns"])
                for info in constraints.values()
                if info["index"] and info["columns"]
            }
            for columns in wanted:
                with self.subTest(table=table, columns=columns):
                    self.assertIn(columns, indexed)

    def test_migrations_match_the_models_exactly(self) -> None:
        # Any schema drift exits non-zero; a clean state returns normally.
        try:
            call_command("makemigrations", "--check", "--dry-run", verbosity=0)
        except SystemExit as exc:  # pragma: no cover - failure path
            self.fail(f"migration drift: makemigrations --check exited {exc.code}")


class MigrationRoundTripTests(TransactionTestCase):
    """M2-A5: the swap preserves rows; EVERY migration reverses (D1)."""

    def test_scope_swap_round_trip_preserves_profile_rows(self) -> None:
        _user, profile = make_profile(
            username="d1roundtrip",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            institution_code="INST-DU-001",
            club_code="CLB-DU-CULT",
            zone_code="NORTH",
            state_code="DELHI",
        )
        pk = profile.pk

        # Backwards: accounts back to the M1 plain-char state.
        call_command("migrate", "accounts", "0001_initial", verbosity=0)
        row = Profile.objects.get(pk=pk)
        self.assertEqual(row.zone_code, "NORTH")
        self.assertEqual(row.institution_code, "INST-DU-001")

        # Forward again: FK swap re-applied, values still intact.
        call_command("migrate", "accounts", "0002_profile_scope_fks", verbosity=0)
        row = Profile.objects.get(pk=pk)
        self.assertEqual(row.zone_code, "NORTH")
        self.assertEqual(row.club_code, "CLB-DU-CULT")
        self.assertEqual(row.state_code, "DELHI")

    def test_domain_migrations_reverse_and_reapply(self) -> None:
        call_command("migrate", "accounts", "0001_initial", verbosity=0)
        call_command("migrate", "domain", "zero", verbosity=0)
        tables = connection.introspection.table_names()
        self.assertNotIn(Zone._meta.db_table, tables)
        call_command("migrate", verbosity=0)
        tables = connection.introspection.table_names()
        for model in (Zone, State, District, Institution, Club, Membership):
            with self.subTest(model=model.__name__):
                self.assertIn(model._meta.db_table, tables)
