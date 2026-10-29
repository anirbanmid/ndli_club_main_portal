"""M2U pins — one person = ONE record (BRIEF_M2U.md §3).

Named gates:

* **U1**  schema — the identity + profile is a single table; the side
  ``accounts_profile`` table is gone; no ``Profile`` shim exists; every user
  FK in the real schema targets the merged row key (introspected, both
  engines).
* **U2**  data safety — the merge round-trip is pinned in
  ``tests/test_m2_d1_schema.py::MigrationRoundTripTests`` (backwards restores
  the profile table, forward re-merges, field-by-field equality both ways);
  here we pin that seeding lands exactly one row per person.
* **U3**  regression — the FULL T1–T7 + D1–D5 + M2-security suite passes with
  mechanical identity-surface diffs only (it is this very run).
* **U4**  auth parity — M1-era password hash strings still verify unchanged
  (the storage format was not touched by the merge).
* **U5**  capacity — the P2 index plan is present on the user table in the
  REAL schema.
"""

from __future__ import annotations

from typing import Any

from django.contrib.auth import hashers
from django.core.management import call_command
from django.db import connection

from apps.accounts.models import Category, SubRole, User

from .support import GOOD_PASSWORD, make_user
from .support import M1PinTestCase as TestCase

#: Tables that carry a user foreign key: table -> (fk column, target).
USER_FK_TABLES: dict[str, tuple[str, tuple[str, str]]] = {
    "accounts_emailotp": ("user_id", ("accounts_user", "id")),
    "accounts_emaillinktoken": ("user_id", ("accounts_user", "id")),
    "accounts_totprecoverycode": ("user_id", ("accounts_user", "id")),
    "domain_membership": ("user_id", ("accounts_user", "id")),
    "domain_officerassignment": ("officer_id", ("accounts_user", "id")),
    "domain_authorityassignment": ("user_id", ("accounts_user", "id")),
}

#: The P2 index plan on the merged user table (BRIEF_M2U.md §3 / U5).
#: Legacy ``auth_user_*`` prefixes are stable identifiers: migration 0004
#: renamed the TABLE only (indexes are never renamed — churn without value).
USER_INDEXES = (
    "auth_user_categor_9de067_idx",
    "auth_user_institu_46392f_idx",
    "auth_user_club_co_6bb4a8_idx",
    "auth_user_zone_co_3252d4_idx",
    "auth_user_state_c_4b197f_idx",
)


def _constraints(table: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        return connection.introspection.get_constraints(cursor, table)


class U1SchemaTests(TestCase):
    """One model, one table, no shim (M2U-A4)."""

    def test_identity_and_profile_live_on_the_user_table(self) -> None:
        self.assertEqual(User._meta.db_table, "accounts_user")

    def test_the_side_profile_table_is_gone(self) -> None:
        tables = connection.introspection.table_names()
        self.assertNotIn("accounts_profile", tables)

    def test_no_profile_shim_is_left_behind(self) -> None:
        import apps.accounts.models as models

        self.assertFalse(hasattr(models, "Profile"))
        self.assertFalse(hasattr(User, "profile_of"))
        # The M1 code-string compat surface is the scope keys, not identity.
        self.assertFalse(hasattr(User, "profile"))

    def test_every_user_fk_targets_the_merged_row_key(self) -> None:
        for table, (column, target) in USER_FK_TABLES.items():
            with self.subTest(table=table):
                found = {
                    info["foreign_key"]
                    for info in _constraints(table).values()
                    if info["foreign_key"] and tuple(info["columns"]) == (column,)
                }
                self.assertEqual(found, {target})


class U2DataSafetyTests(TestCase):
    """Seeding leaves exactly one row per person (no parallel copy, P4)."""

    def test_seeding_creates_one_row_per_person(self) -> None:
        call_command("seed_samples", verbosity=0)
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM accounts_user")
            users = cursor.fetchone()[0]
        self.assertEqual(User.objects.count(), users)
        self.assertEqual(User.objects.values("username").distinct().count(), users)
        tables = connection.introspection.table_names()
        self.assertNotIn("accounts_profile", tables)


class U4AuthParityTests(TestCase):
    """Password storage format is untouched (P0: the merge moves no secrets)."""

    def test_an_m1_era_hash_string_still_verifies_unchanged(self) -> None:
        stored = hashers.make_password(
            GOOD_PASSWORD, salt="m1-era-fixed-salt", hasher="pbkdf2_sha256"
        )
        user = make_user(
            username="u4hash",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
        )
        User.objects.filter(pk=user.pk).update(password=stored)
        user.refresh_from_db()
        self.assertEqual(user.password, stored)
        self.assertTrue(user.check_password(GOOD_PASSWORD))
        self.assertFalse(user.check_password("not-the-password"))

    def test_the_merged_row_keeps_the_hash_byte_for_byte(self) -> None:
        user = make_user(
            username="u4keep",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
        )
        before = user.password
        user.category = Category.CLUB_ADMIN
        user.sub_role = SubRole.CLUB_PRESIDENT
        user.save(update_fields=["category", "sub_role"])
        user.refresh_from_db()
        self.assertEqual(user.password, before)


class U5CapacityTests(TestCase):
    """The P2 index plan is really on the table (introspected)."""

    def test_every_planned_user_index_exists(self) -> None:
        constraints = _constraints("accounts_user")
        present = {name for name, info in constraints.items() if info["index"]}
        for name in USER_INDEXES:
            with self.subTest(index=name):
                self.assertIn(name, present)

    def test_the_username_stays_the_unique_login_key(self) -> None:
        constraints = _constraints("accounts_user")
        unique = {
            tuple(info["columns"])
            for info in constraints.values()
            if info["unique"] and info["columns"]
        }
        self.assertIn(("username",), unique)
