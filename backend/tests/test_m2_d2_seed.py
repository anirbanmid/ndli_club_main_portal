"""D2 — seed integrity pins (BRIEF_M2.md §4): real, idempotent, soft-verified.

Named pins:
* ``make seed`` loads the full SAMPLE dataset and ``verify_domain`` is
  CLEAN afterwards (findings 0; the 11 unrostered States/UTs are notices,
  exactly as BRIEF_M2.md §6 specifies — reported, never blocked);
* re-running the seed is idempotent (no duplicates, no drift);
* AISHE-less institutions are fully usable (soft verification) and linking
  an AISHE code later is an audited, validated action;
* ``--reset`` is BOUNDED (only seed rows) and ``--dry-run`` writes nothing.
"""
from __future__ import annotations

import json
from io import StringIO
from typing import Any, cast

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db.models import Model

from apps.accounts.models import User
from apps.domain import verify
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
from apps.domain.seed import SAMPLES_DIR, load_samples

from .support import Category, SubRole, make_user
from .support import M1PinTestCase as TestCase

#: The roster-less States/UTs of BRIEF_M2.md §6 (awaiting officer assignment).
UNROSTERED_STATES = {
    "ANDAMAN_AND_NICOBAR_ISLANDS",
    "ARUNACHAL_PRADESH",
    "CHANDIGARH",
    "DADRA_AND_NAGAR_HAVELI_AND_DAMAN_AND_DIU",
    "HIMACHAL_PRADESH",
    "LADAKH",
    "LAKSHADWEEP",
    "MIZORAM",
    "NAGALAND",
    "SIKKIM",
    "UTTARAKHAND",
}


class SampleWidthPins(TestCase):
    """Regression pins for the varchar-overflow bug class.

    SQLite silently accepts values wider than a ``max_length`` column;
    Postgres rejects them (``StringDataRightTruncation``). The sample seed must
    fit every column it writes — asserted from the REAL model field widths.
    """

    WIDTH_MAP: tuple[tuple[str, str, type[Model], str], ...] = (
        ("zones.json", "code", Zone, "code"),
        ("zones.json", "name", Zone, "name"),
        ("states.json", "code", State, "code"),
        ("states.json", "name", State, "name"),
        ("districts.json", "code", District, "code"),
        ("districts.json", "name", District, "name"),
        ("institutions.json", "code", Institution, "code"),
        ("institutions.json", "legacy_id", Institution, "legacy_id"),
        ("institutions.json", "aishe_code", Institution, "aishe_code"),
        ("institutions.json", "name", Institution, "name"),
        ("clubs.json", "code", Club, "code"),
        ("clubs.json", "institution", Institution, "code"),
        ("clubs.json", "name", Club, "name"),
        ("memberships.json", "role", Membership, "role"),
        ("memberships.json", "status", Membership, "status"),
        ("authority_assignments.json", "tier", AuthorityAssignment, "tier"),
        ("authority_assignments.json", "status", AuthorityAssignment, "status"),
        ("users.json", "username", get_user_model(), "username"),
        ("users.json", "email", get_user_model(), "email"),
        ("users.json", "category", User, "category"),
        ("users.json", "sub_role", User, "sub_role"),
        ("users.json", "account_state", User, "account_state"),
        ("users.json", "institution", Institution, "code"),
        ("users.json", "club", Club, "code"),
        ("users.json", "state", State, "code"),
        ("users.json", "zone", Zone, "code"),
    )

    def test_every_sample_value_fits_its_column_width(self) -> None:
        for filename, key, model, field_name in self.WIDTH_MAP:
            rows = json.loads((SAMPLES_DIR / filename).read_text(encoding="utf-8"))
            field = cast(Any, model._meta.get_field(field_name))
            limit = field.max_length
            for row in rows:
                value = row.get(key)
                if not isinstance(value, str) or not value:
                    continue
                with self.subTest(file=filename, key=key, value=value):
                    self.assertIsNotNone(
                        limit, f"{model.__name__}.{field_name} is unbounded"
                    )
                    assert limit is not None
                    self.assertLessEqual(
                        len(value),
                        limit,
                        f"{filename}:{key} {value!r} ({len(value)}) overflows "
                        f"{model.__name__}.{field_name} (max_length={limit})",
                    )


class SeedLoadTests(TestCase):
    def test_the_sample_seed_loads_and_verify_is_clean(self) -> None:
        call_command("seed_samples", verbosity=0)
        self.assertEqual(Zone.objects.count(), 6)
        self.assertEqual(State.objects.count(), 36)
        self.assertEqual(District.objects.count(), 24)
        self.assertEqual(Institution.objects.count(), 12)
        self.assertEqual(Club.objects.count(), 10)
        self.assertEqual(Membership.objects.count(), 15)
        self.assertEqual(AuthorityAssignment.objects.count(), 11)
        self.assertEqual(OfficerAssignment.objects.count(), 25)
        report = verify.run_checks()
        self.assertEqual(report.findings, [], "verify_domain must be CLEAN")
        self.assertTrue(report.clean)
        awaiting = {line.split(" ", 1)[0] for line in report.awaiting_officer}
        self.assertEqual(awaiting, UNROSTERED_STATES)

    def test_reseeding_is_idempotent(self) -> None:
        call_command("seed_samples", verbosity=0)
        before = {
            "zones": Zone.objects.count(),
            "states": State.objects.count(),
            "institutions": Institution.objects.count(),
            "clubs": Club.objects.count(),
            "memberships": Membership.objects.count(),
            "users": get_user_model().objects.count(),
        }
        result = load_samples()
        self.assertEqual(result.counts["zones"]["created"], 0)
        self.assertEqual(result.counts["users"]["created"], 0)
        self.assertEqual(
            {
                "zones": Zone.objects.count(),
                "states": State.objects.count(),
                "institutions": Institution.objects.count(),
                "clubs": Club.objects.count(),
                "memberships": Membership.objects.count(),
                "users": get_user_model().objects.count(),
            },
            before,
            "a second seed run must not duplicate a single row",
        )

    def test_aishe_less_institutions_are_usable_and_soft_verified(self) -> None:
        call_command("seed_samples", verbosity=0)
        legacy = Institution.objects.get(code="INST-GJ-001")
        self.assertIsNone(legacy.aishe_code)
        self.assertFalse(legacy.aishe_verified)
        # Usable: clubs and memberships attach to it without any AISHE code.
        club = Club.objects.create(
            code="CLB-GJ-NEW", institution=legacy, name="GJ club"
        )
        user = make_user(
            username="d2legacy",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
        )
        Membership.objects.create(user=user, club=club)
        self.assertTrue(
            Membership.objects.filter(club__institution=legacy).exists()
        )

    def test_reset_is_bounded_to_seed_rows(self) -> None:
        call_command("seed_samples", verbosity=0)
        keep_zone = Zone.objects.create(code="KEEPZONE", name="Not in any seed file")
        keep_state = State.objects.create(
            code="KEEPSTATE", name="Not in any seed file", zone=keep_zone
        )
        keep_profile = make_user(
            username="keepme",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
        )
        call_command("seed_samples", "--reset", verbosity=0)
        self.assertTrue(State.objects.filter(code="KEEPSTATE").exists())
        self.assertTrue(Zone.objects.filter(code="KEEPZONE").exists())
        self.assertTrue(
            get_user_model().objects.filter(username="keepme").exists()
        )
        self.assertTrue(User.objects.filter(pk=keep_profile.pk).exists())
        # Reset removed ONLY seed rows and re-created them: exactly the 6 seed
        # zones again (the out-of-seed keeper survives → total 7).
        self.assertEqual(Zone.objects.count(), 7)
        self.assertEqual(Zone.objects.exclude(code="KEEPZONE").count(), 6)
        self.assertEqual(OfficerAssignment.objects.count(), 25)
        # And the reloaded dataset verifies clean again.
        self.assertTrue(verify.run_checks().clean)
        self.assertIsNotNone(keep_state.pk)

    def test_dry_run_writes_nothing(self) -> None:
        before = Zone.objects.count()
        result = load_samples(dry_run=True)
        self.assertEqual(result.total(), 163)
        self.assertEqual(Zone.objects.count(), before)


class VerifyDomainCommandTests(TestCase):
    def test_the_command_reports_and_never_blocks(self) -> None:
        call_command("seed_samples", verbosity=0)
        out = StringIO()
        call_command("verify_domain", stdout=out)  # exit code 0 always
        text = out.getvalue()
        self.assertIn("RESULT: CLEAN", text)
        self.assertIn("NOTICE awaiting-officer-assignment: 11", text)

    def test_strict_mode_is_opt_in_for_ci(self) -> None:
        out = StringIO()
        # No seed: a profile with unbacked codes is an orphan scope code.
        make_user(
            username="d2orphan",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_PRESIDENT,
            club_code="CLB-GHOST",
        )
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command("verify_domain", "--strict", stdout=out)
        self.assertIn("RESULT: FINDINGS PRESENT", out.getvalue())
