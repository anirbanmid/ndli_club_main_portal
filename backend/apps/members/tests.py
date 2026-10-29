"""Per-app unit pins for the Members app (M4 D3).

The database-level promises of ``JoinRequest``: one pending request per
(user, club), and scope keys identical to ``domain.Membership`` so the M1
policy layer scopes both tables the same way (I5).
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.domain.models import Membership

from .models import JoinRequest


class JoinRequestModelTests(TestCase):
    def test_scope_lookups_mirror_membership(self) -> None:
        self.assertEqual(JoinRequest.SCOPE_LOOKUPS, Membership.SCOPE_LOOKUPS)

    def test_only_one_pending_request_per_user_and_club(self) -> None:
        from django.contrib.auth import get_user_model

        from apps.domain.models import Club, Institution, State, Zone

        zone = Zone.objects.create(code="M1", name="Members zone")
        state = State.objects.create(code="M1S", name="Members state", zone=zone)
        institution = Institution.objects.create(
            code="M1I", legacy_id="LEG-M1I", name="Members institution", state=state
        )
        club = Club.objects.create(
            code="M1C", institution=institution, name="Members club"
        )
        user = get_user_model().objects.create_user(
            username="m1joiner", password="x" * 12
        )
        JoinRequest.objects.create(user=user, club=club)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                JoinRequest.objects.create(user=user, club=club)
        # Once decided, a NEW request is allowed again (re-request after
        # rejection/approval must not deadlock the roster).
        row = JoinRequest.objects.get()
        row.status = JoinRequest.Status.REJECTED
        row.save(update_fields=["status"])
        fresh = JoinRequest.objects.create(user=user, club=club)
        self.assertEqual(fresh.status, JoinRequest.Status.PENDING)
