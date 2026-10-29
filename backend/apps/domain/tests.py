"""Tests for the Domain app.

The named milestone pins live in ``backend/tests/test_m2_d*.py`` (gates
D1-D5) and ``backend/tests/test_m2_security.py`` (adversarial pins). This
module only carries the per-app smoke checks in the M1 house style.
"""

from django.test import TestCase

from apps.domain.models import Zone


class DomainModelSmokeTests(TestCase):
    def test_zone_str_is_stable(self) -> None:
        zone = Zone(code="EAST", name="East")
        self.assertEqual(str(zone), "EAST (East)")

    def test_zone_scope_lookup_registry_is_present(self) -> None:
        self.assertEqual(Zone.SCOPE_LOOKUPS, {"zone": "code"})
