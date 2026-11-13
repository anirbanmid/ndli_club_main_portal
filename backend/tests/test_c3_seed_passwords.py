"""C3 closure pins (2026-11-13): the seed pipeline ships no repo-public credential.

Three regression locks:

1. the demo account specs carry NO password key at all — the repository can
   never again hold a usable credential for a production-reachable account;
2. the generator emits policy-compliant, class-complete random passwords;
3. the command creates accounts with a repo-unknown password (printed once)
   and a re-run NEVER rewrites an existing credential — idempotency without
   silently invalidating the password an operator saved.
"""

from __future__ import annotations

import io

from django.contrib.auth.hashers import check_password
from django.core.management import call_command
from django.test import TestCase

from apps.accounts.models import User
from apps.accounts.passwords import validate_password_strength
from apps.domain.management.commands.seed_demo_accounts import (
    CLUB_ADMINS,
    HEI_STUDENT_MEMBERS,
    _generate_password,
)
from apps.domain.models import Club, Institution, State, Zone

#: Every credential this repository has ever shipped for seed/demo accounts.
REPO_PUBLIC_PASSWORDS = (
    "Password@123",
    "NdliClub@2026!",
    "NdliOffice@2026!",
    "Dummy123456",
    "DemoClub1!2026",
    "DemoClub2!2026",
    "DemoMem1!2026",
    "DemoMem2!2026",
)

DEMO_USERNAMES = (
    "demo.club.bhu",
    "demo.club.iitkgp",
    "demo.member.dati",
    "demo.member.iitkgp",
)


class SeedSpecPins(TestCase):
    """The specs themselves must never carry a credential again."""

    def test_specs_carry_no_password_key(self) -> None:
        for spec in [*CLUB_ADMINS, *HEI_STUDENT_MEMBERS]:
            self.assertNotIn(
                "password",
                spec,
                "demo specs must not embed a password — generate at runtime",
            )

    def test_no_spec_password_is_repo_public(self) -> None:
        for spec in [*CLUB_ADMINS, *HEI_STUDENT_MEMBERS]:
            value = str(spec.get("password", ""))
            self.assertNotIn(value, REPO_PUBLIC_PASSWORDS)


class GeneratorPins(TestCase):
    """_generate_password must satisfy the M1 policy every single time."""

    def test_generated_passwords_are_strong_and_varied(self) -> None:
        seen: set[str] = set()
        for _ in range(25):
            pw = _generate_password()
            self.assertEqual(len(pw), 18)
            self.assertTrue(any(c.islower() for c in pw))
            self.assertTrue(any(c.isupper() for c in pw))
            self.assertTrue(any(c.isdigit() for c in pw))
            self.assertTrue(any(c in "!@#%-_" for c in pw))
            validate_password_strength(pw)  # must not raise
            self.assertNotIn(pw, seen, "25 draws collided — entropy too low")
            seen.add(pw)


class SeedCommandPins(TestCase):
    """End-to-end: creation prints a fresh credential; re-runs preserve it."""

    @classmethod
    def setUpTestData(cls) -> None:
        zone_north, _ = Zone.objects.get_or_create(
            code="NORTH", defaults={"name": "North"}
        )
        zone_east, _ = Zone.objects.get_or_create(
            code="EAST", defaults={"name": "East"}
        )
        state_up, _ = State.objects.get_or_create(
            code="UTTAR_PRADESH",
            defaults={"name": "Uttar Pradesh", "zone": zone_north},
        )
        state_wb, _ = State.objects.get_or_create(
            code="WEST_BENGAL", defaults={"name": "West Bengal", "zone": zone_east}
        )
        state_dl, _ = State.objects.get_or_create(
            code="DELHI", defaults={"name": "Delhi", "zone": zone_north},
        )
        inst_bhu, _ = Institution.objects.get_or_create(
            code="INST-BHU-008",
            defaults={"legacy_id": "onb-bhu008", "name": "BHU", "state": state_up},
        )
        inst_iitkgp, _ = Institution.objects.get_or_create(
            code="INST-IITKGP-001",
            defaults={
                "legacy_id": "onb-iitkgp001",
                "name": "IIT Kharagpur",
                "state": state_wb,
            },
        )
        inst_dati, _ = Institution.objects.get_or_create(
            code="INST-DATI-001",
            defaults={"legacy_id": "onb-dati001", "name": "DATI", "state": state_dl},
        )
        for code, inst in (
            ("CLUB-BHU-008", inst_bhu),
            ("CLUB-IITKGP-001", inst_iitkgp),
            ("NDLI-EMP01-002", inst_dati),
        ):
            Club.objects.get_or_create(
                code=code, defaults={"institution": inst, "name": code}
            )

    @staticmethod
    def _run() -> tuple[str, dict[str, str]]:
        """Run the command; return (raw output, username -> printed password)."""
        out = io.StringIO()
        call_command("seed_demo_accounts", stdout=out)
        text = out.getvalue()
        printed: dict[str, str] = {}
        current = ""
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("Username: "):
                current = stripped.removeprefix("Username: ")
            elif stripped.startswith("Password: ") and current:
                printed[current] = stripped.removeprefix("Password: ")
        return text, printed

    def test_create_prints_repo_unknown_password_and_rerun_preserves_it(self) -> None:
        # Start from a clean slate (migration-time leftovers must not decide
        # which code path runs).
        User.objects.filter(username__startswith="demo.").delete()

        first_text, first_printed = self._run()
        self.assertEqual(set(first_printed), set(DEMO_USERNAMES))

        for username in DEMO_USERNAMES:
            password = first_printed[username]
            self.assertNotIn(
                password,
                REPO_PUBLIC_PASSWORDS,
                f"{username} was created with a repo-public password",
            )
            user = User.objects.get(username=username)
            self.assertTrue(
                check_password(password, user.password),
                f"printed password for {username} does not authenticate",
            )
            self.assertFalse(user.must_change_password)
            self.assertTrue(user.is_active)

        # Re-run: no credential may be rewritten (hash bytes must be identical)
        # and the output must stop claiming a password.
        before = {
            u: User.objects.get(username=u).password for u in DEMO_USERNAMES
        }
        second_text, second_printed = self._run()
        for username in DEMO_USERNAMES:
            after = User.objects.get(username=username).password
            self.assertEqual(
                after,
                before[username],
                f"re-run rewrote the credential for {username}",
            )
            self.assertIn("unchanged", second_printed[username])
        self.assertIn("ALL DEMO ACCOUNTS PROCESSED", first_text)
