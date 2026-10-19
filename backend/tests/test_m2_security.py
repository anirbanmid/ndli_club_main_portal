"""M2 adversarial security pins (P0: evidence, not claims).

Named pins (each closes a concrete attack path, see SECURITY_FINDINGS.md
SF-003..SF-008):

* seed files can never smuggle extra fields, ORM-lookup-shaped codes or
  oversized/control-character values into the loader (injection + mass
  assignment);
* the loader refuses to touch production without the explicit flag, and
  even ``--reset`` is bounded to seed rows (P5);
* sample accounts NEVER carry usable credentials;
* ``legacy_id`` is immutable once written (the migration anchor);
* ``verify_domain`` mutates nothing (one audit row per run, that is all);
* membership is strictly relational (duplicate pair rejected by the DB);
* AISHE linking is validated, unique and audited (soft verification done
  right).
"""
from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import IntegrityError, transaction

from apps.audit.models import AuditLog
from apps.domain import seed, verify
from apps.domain.models import Club, Institution, Membership, Zone
from apps.domain.services import link_aishe_code

from .m2_support import add_membership, build_zone_graph
from .support import Category, SubRole, make_profile
from .support import M1PinTestCase as TestCase


class SeedInjectionPins(TestCase):
    def _with_poisoned(self, filename: str, payload: str):
        """Full sample set with exactly one poisoned file (temp copy)."""
        tmp = Path(tempfile.mkdtemp(prefix="m2seed"))
        samples = tmp / "samples"
        shutil.copytree(seed.SAMPLES_DIR, samples)
        (samples / filename).write_text(payload, encoding="utf-8")
        return mock.patch.object(seed, "SAMPLES_DIR", samples), tmp

    def _rejected(self, filename: str, payload: str) -> None:
        patcher, tmp = self._with_poisoned(filename, payload)
        try:
            with patcher, self.assertRaises(seed.SeedValidationError):
                seed.load_samples()
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        self.assertEqual(Zone.objects.count(), 0, "nothing may be written")

    def test_extra_fields_are_rejected_mass_assignment_guard(self) -> None:
        rows = json.loads((seed.SAMPLES_DIR / "users.json").read_text())
        rows[0]["is_superuser"] = True  # privilege-escalation attempt
        self._rejected("users.json", json.dumps(rows))

    def test_lookup_shaped_codes_are_rejected(self) -> None:
        rows = json.loads((seed.SAMPLES_DIR / "zones.json").read_text())
        rows[0]["code"] = "X__Y"  # ORM-lookup-shaped value
        self._rejected("zones.json", json.dumps(rows))

    def test_control_characters_and_oversized_names_are_rejected(self) -> None:
        rows = json.loads((seed.SAMPLES_DIR / "districts.json").read_text())
        rows[0]["name"] = "bad\x00name"
        self._rejected("districts.json", json.dumps(rows))
        rows[0]["name"] = "x" * 300
        self._rejected("districts.json", json.dumps(rows))

    def test_malformed_dates_and_shapes_are_rejected(self) -> None:
        rows = json.loads((seed.SAMPLES_DIR / "memberships.json").read_text())
        rows[0]["joined_on"] = "not-a-date"
        self._rejected("memberships.json", json.dumps(rows))
        self._rejected("zones.json", '{"not": "a list"}')

    def test_the_production_guard_refuses_seeding_unflagged(self) -> None:
        with mock.patch.dict(os.environ, {"DJANGO_ENV": "production"}):
            self.assertTrue(seed.is_production())
            with self.assertRaises(seed.SeedValidationError):
                seed.load_samples()
            with self.assertRaises(seed.SeedValidationError):
                seed.load_samples(reset=True)
        self.assertEqual(Zone.objects.count(), 0)

    def test_sample_accounts_never_carry_usable_credentials(self) -> None:
        seed.load_samples()
        for username in ("EMP01", "CULT-PRES", "STUDENT-01"):
            user = get_user_model().objects.get(username=username)
            self.assertFalse(user.has_usable_password(), username)


class ImmutabilityAndReadOnlyPins(TestCase):
    def test_legacy_id_is_immutable_once_written(self) -> None:
        build_zone_graph()
        institution = Institution.objects.get(code="INST-DU-001")
        institution.legacy_id = "LEG-HIJACKED"
        with self.assertRaises(ValidationError):
            institution.save()
        institution.refresh_from_db()
        self.assertEqual(institution.legacy_id, "LEG-INST-DU-001")

    def test_verify_domain_is_read_only(self) -> None:
        build_zone_graph()
        user, _profile = make_profile(
            username="secstu",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
        )
        club = Club.objects.get(code="CLB-DU-CULT")
        add_membership(user, club)
        before = {
            "clubs": Club.objects.count(),
            "memberships": Membership.objects.count(),
            "institutions": Institution.objects.count(),
            "audit": AuditLog.objects.count(),
        }
        report = verify.run_checks()
        self.assertTrue(report.clean)
        call_command("verify_domain")
        self.assertEqual(Club.objects.count(), before["clubs"])
        self.assertEqual(Membership.objects.count(), before["memberships"])
        self.assertEqual(Institution.objects.count(), before["institutions"])
        self.assertEqual(
            AuditLog.objects.count(),
            before["audit"] + 1,
            "exactly one audit row per command run",
        )

    def test_membership_is_strictly_relational(self) -> None:
        build_zone_graph()
        user, _profile = make_profile(
            username="secdup",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
        )
        club = Club.objects.get(code="CLB-DU-CULT")
        add_membership(user, club)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Membership.objects.create(user=user, club=club)

    def test_aishe_linking_is_validated_unique_and_audited(self) -> None:
        build_zone_graph()
        institution = Institution.objects.get(code="INST-DU-001")
        other = Institution.objects.get(code="INST-MH-001")
        with self.assertRaises(ValidationError):
            link_aishe_code(institution=institution, aishe_code="DROP TABLE x")
        link_aishe_code(institution=institution, aishe_code="AISHE-C-999999")
        institution.refresh_from_db()
        self.assertEqual(institution.aishe_code, "AISHE-C-999999")
        self.assertTrue(institution.aishe_verified)
        self.assertTrue(
            AuditLog.objects.filter(action="institution.aishe_linked").exists()
        )
        with self.assertRaises(ValidationError):
            link_aishe_code(institution=other, aishe_code="AISHE-C-999999")
        with self.assertRaises(ValidationError):
            link_aishe_code(
                institution=institution, aishe_code="AISHE-C-111111"
            )
