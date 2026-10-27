"""M6 D5 slice 9 -- Dual-Layer Security Challenge (0018) -- T-matrix pins.

PLAN_0018_DUAL_LAYER.md sec.5:
  * server-level re-auth accepts the SUPEROPS password, rejects CENTRALADM
    (and vice versa) -> turf separation pinned BOTH ways (AUTH-TURF).
  * EMP role denied both turfs.
  * wrong-domain re-auth rejected.
  * challenge token ONE-SHOT (replay rejected), domain-bound, expiring.
"""
from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import AccountState, Category, SubRole
from apps.accounts.security_challenge import (
    DOMAIN_BUSINESS,
    DOMAIN_SERVER,
    SC_SESSION_KEY,
    consume_challenge,
    issue_challenge,
    verify_domain_password,
)

User = get_user_model()

CENTRAL_PASSWORD = 'Central' + '-Adm-Pass-2026!'
SUPER_PASSWORD = 'Super' + '-Ops-Pass-2026!'
EMP_PASSWORD = 'Emp' + '-Pass-2026!'
CHALLENGE_URL = '/api/v1/accounts/security-challenge/'


class _SessionRequest:
    """Minimal request stand-in: challenge helpers only touch ``.session``."""

    def __init__(self) -> None:
        self.session: dict[str, Any] = {}


class TurfSeparationTests(TestCase):
    """AUTH-TURF pins: the two password turfs NEVER cross (owner law)."""

    central: Any
    emp: Any
    superops: Any

    @classmethod
    def setUpTestData(cls) -> None:
        cls.central = User.objects.create_user(
            username='centraladm', email='central@example.test',
            password=CENTRAL_PASSWORD,
            category=Category.IIT_KGP_ADMIN, sub_role=SubRole.CENTRAL_ADMIN,
            account_state=AccountState.ACTIVE,
        )
        cls.superops = User.objects.create_user(
            username='superops', email='superops@example.test',
            password=SUPER_PASSWORD,
            category=Category.IIT_KGP_ADMIN, sub_role=SubRole.SUPER_ADMIN_OPS,
            account_state=AccountState.ACTIVE,
        )
        cls.emp = User.objects.create_user(
            username='emp01', email='emp01@example.test',
            password=EMP_PASSWORD,
            category=Category.IIT_KGP_ADMIN, sub_role=SubRole.REGIONAL_OFFICER,
            account_state=AccountState.ACTIVE,
        )

    def test_business_turf_accepts_central_password_only(self) -> None:
        self.assertEqual(
            verify_domain_password(DOMAIN_BUSINESS, CENTRAL_PASSWORD),
            self.central,
        )
        self.assertIsNone(verify_domain_password(DOMAIN_BUSINESS, SUPER_PASSWORD))
        self.assertIsNone(verify_domain_password(DOMAIN_BUSINESS, EMP_PASSWORD))

    def test_server_turf_accepts_superops_password_only(self) -> None:
        self.assertEqual(
            verify_domain_password(DOMAIN_SERVER, SUPER_PASSWORD), self.superops
        )
        self.assertIsNone(verify_domain_password(DOMAIN_SERVER, CENTRAL_PASSWORD))
        self.assertIsNone(verify_domain_password(DOMAIN_SERVER, EMP_PASSWORD))

    def test_emp_credentials_pass_neither_turf(self) -> None:
        self.assertIsNone(verify_domain_password(DOMAIN_BUSINESS, EMP_PASSWORD))
        self.assertIsNone(verify_domain_password(DOMAIN_SERVER, EMP_PASSWORD))


class ChallengeLifecycleTests(TestCase):
    """Layer-1 discipline: one-shot, domain-bound, expiring (P0)."""

    def test_token_is_one_shot(self) -> None:
        request = _SessionRequest()
        challenge = issue_challenge(request, DOMAIN_BUSINESS)
        answer = request.session[SC_SESSION_KEY][challenge['token']]['answer']
        self.assertTrue(
            consume_challenge(request, challenge['token'], answer, DOMAIN_BUSINESS)
        )
        self.assertFalse(
            consume_challenge(request, challenge['token'], answer, DOMAIN_BUSINESS)
        )

    def test_wrong_answer_burns_the_challenge(self) -> None:
        request = _SessionRequest()
        challenge = issue_challenge(request, DOMAIN_BUSINESS)
        answer = request.session[SC_SESSION_KEY][challenge['token']]['answer']
        self.assertFalse(
            consume_challenge(request, challenge['token'], 'WRONG9', DOMAIN_BUSINESS)
        )
        self.assertFalse(
            consume_challenge(request, challenge['token'], answer, DOMAIN_BUSINESS)
        )

    def test_case_mismatched_answer_rejected_and_burned(self) -> None:
        request = _SessionRequest()
        while True:
            challenge = issue_challenge(request, DOMAIN_BUSINESS)
            answer = request.session[SC_SESSION_KEY][challenge['token']]['answer']
            if any(ch.isalpha() for ch in answer):
                break
        self.assertFalse(
            consume_challenge(
                request, challenge['token'], answer.lower(), DOMAIN_BUSINESS
            )
        )
        # One-shot: even trying the right answer now fails because the row is popped
        self.assertFalse(
            consume_challenge(request, challenge['token'], answer, DOMAIN_BUSINESS)
        )

    def test_domain_bound_token_rejected_across_turfs(self) -> None:
        request = _SessionRequest()
        challenge = issue_challenge(request, DOMAIN_SERVER)
        answer = request.session[SC_SESSION_KEY][challenge['token']]['answer']
        self.assertFalse(
            consume_challenge(request, challenge['token'], answer, DOMAIN_BUSINESS)
        )

    def test_expired_challenge_rejected(self) -> None:
        request = _SessionRequest()
        challenge = issue_challenge(request, DOMAIN_BUSINESS)
        row = request.session[SC_SESSION_KEY][challenge['token']]
        answer = row['answer']
        row['expires'] = 0
        self.assertFalse(
            consume_challenge(request, challenge['token'], answer, DOMAIN_BUSINESS)
        )

    def test_unknown_token_rejected(self) -> None:
        self.assertFalse(
            consume_challenge(_SessionRequest(), 'nope', '23456', DOMAIN_BUSINESS)
        )

    def test_issue_endpoint_auth_and_domain_gated(self) -> None:
        client = APIClient()
        anonymous = client.post(CHALLENGE_URL, {'domain': 'business'}, format='json')
        self.assertIn(
            anonymous.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
        user = User.objects.create_user(
            username='emp02', email='emp02@example.test',
            password=EMP_PASSWORD,
            category=Category.IIT_KGP_ADMIN, sub_role=SubRole.REGIONAL_OFFICER,
            account_state=AccountState.ACTIVE,
        )
        client.force_authenticate(user=user)
        bad = client.post(CHALLENGE_URL, {'domain': 'nonsense'}, format='json')
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        good = client.post(CHALLENGE_URL, {'domain': 'business'}, format='json')
        self.assertEqual(good.status_code, status.HTTP_200_OK)
        self.assertIn('draw', good.json())
        self.assertIn('token', good.json())
