"""Client password-standard pins (owner 2026-10-27).

"Passwords encrypted using PBKDF2-HMAC-SHA256 with 100,000 rounds and
16-byte random salts." — byte-level pins on the stored hash shape, so the
standard cannot silently drift. Credential values come from constants (never
literals) and the seed table — mask-proof and honest.
"""
from __future__ import annotations

import re

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import (
    check_password,
    identify_hasher,
    make_password,
)
from django.core.management import call_command

from apps.accounts.models import Category, SubRole
from apps.core.management.commands.seed_office_demo import IDENTITIES
from tests.support import GOOD_PASSWORD, M1PinTestCase, make_user

#: The wire shape the client standard mandates.
HASH_RE = re.compile(r"^pbkdf2_sha256\$100000\$(?P<salt>[^$]+)\$[^$]+$")

#: Derived at runtime (never a literal).
WRONG_PASSWORD = GOOD_PASSWORD + "x"


class PasswordStandardTests(M1PinTestCase):
    def test_new_passwords_use_pbkdf2_sha256_with_100000_rounds(self) -> None:
        encoded = make_password("***")
        self.assertRegex(encoded, HASH_RE)

    def test_salt_is_16_bytes_of_entropy(self) -> None:
        encoded = make_password("***")
        match = HASH_RE.match(encoded)
        assert match is not None
        # Django maps salt_entropy=128 bits onto 22 chars of the 62-char
        # alphabet (>= 128 bits) — the client's "16-byte random salt".
        self.assertGreaterEqual(len(match.group("salt")), 22)

    def test_hasher_pins(self) -> None:
        hasher = identify_hasher(make_password("***"))
        self.assertEqual(hasher.iterations, 100_000)
        self.assertEqual(hasher.salt_entropy, 128)

    def test_verify_round_trip_and_wrong_password_rejected(self) -> None:
        encoded = make_password("***")
        self.assertTrue(check_password("***", encoded))
        self.assertFalse(check_password(WRONG_PASSWORD, encoded))

    def test_user_records_store_the_standard_hash(self) -> None:
        user = make_user(
            username="std01",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
            password=GOOD_PASSWORD
        )
        self.assertRegex(user.password, HASH_RE)

    def test_seed_office_demo_uses_the_standard_hash(self) -> None:
        call_command("seed_office_demo", verbosity=0)
        user = get_user_model().objects.get(username="SUPEROPS")
        self.assertEqual(user.category, Category.IIT_KGP_ADMIN)
        self.assertRegex(user.password, HASH_RE)
        documented = next(row[4] for row in IDENTITIES if row[0] == "SUPEROPS")
        self.assertTrue(check_password(documented, user.password))
