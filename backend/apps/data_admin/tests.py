"""M6 D5 stage 3 — guarded red-zone hard reset.

The security properties pinned here are the whole point of the feature, so they
are tested adversarially:

  * the PIN is checked BEFORE the checkpoint and the wipe
  * a failed safety checkpoint aborts with the data untouched
  * the provisioned skeleton (accounts + credentials + geography) survives
  * NO reseed of any kind happens after the wipe
"""
from __future__ import annotations

import hashlib
from datetime import timedelta
from typing import Any
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import AccountState, Category, SubRole
from apps.accounts.security_challenge import SC_SESSION_KEY
from apps.audit.models import AuditLog
from apps.data_admin.services import (
    EXEMPT_MODELS,
    KEEP_MODELS,
    WIPE_MODELS,
    hard_reset_for_handover,
    unclassified_models,
    wipe_manifest,
)
from apps.domain.models import Club, Institution, State, Zone
from apps.grievances.models import GrievanceTicket

User = get_user_model()

URL = "/admin/api/v1/data/hard-reset/"
PIN = "123456"
PIN_SHA256 = hashlib.sha256(PIN.encode("utf-8")).hexdigest()
MASTER_PASSWORD = "master-pass-1"
GOOD_BODY = {
    "confirm": "HARD-RESET-FOR-HANDOVER",
    "password": MASTER_PASSWORD,
    "pin": PIN,
}


CHALLENGE_URL = "/api/v1/accounts/security-challenge/"
CENTRAL_PASSWORD = "central-pass-1"


def _mint_challenge(client: APIClient) -> dict[str, str]:
    """Mint a live Dual-Layer Layer-1 challenge (SERVER turf: red-zone)."""
    response = client.post(CHALLENGE_URL, {"domain": "server"}, format="json")
    if response.status_code != status.HTTP_200_OK:
        raise AssertionError(f"challenge mint failed: {response.status_code}")
    token = response.json()["token"]
    answer = client.session[SC_SESSION_KEY][token]["answer"]
    return {"challenge": token, "captcha": answer.upper()}


def _login(client: APIClient, user) -> None:
    """Same seam as the other admin-module suites: the admin door needs MFA."""
    client.force_authenticate(user=user)
    session = client.session
    session["mfa_verified"] = True
    session.save()


@override_settings(HANDOVER_PIN_SHA256=PIN_SHA256)
class HardResetGuardTests(TestCase):
    """Layer-by-layer: every guard refuses before the next one is reached."""
    # Fixture attributes created in setUpTestData/setUp (declared for mypy).
    client: Any
    club: Club
    grievance: GrievanceTicket
    inst: Institution
    master: Any
    officer: Any
    state: State
    zone: Zone

    @classmethod
    def setUpTestData(cls) -> None:
        cls.zone = Zone.objects.create(code="N1", name="North 1")
        cls.state = State.objects.create(
            code="UP", name="Uttar Pradesh", zone=cls.zone
        )
        cls.inst = Institution.objects.create(
            code="INST-N1", legacy_id="LEG-N1", name="N1 Institute", state=cls.state
        )
        cls.club = Club.objects.create(
            code="CLUB-A", institution=cls.inst, name="Alpha Club"
        )
        cls.master = User.objects.create_user(
            username="master",
            email="master@example.test",
            password=MASTER_PASSWORD,
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.SUPER_ADMIN_OPS,
            account_state=AccountState.ACTIVE,
        )
        cls.officer = User.objects.create_user(
            username="emp03",
            email="emp03@example.test",
            password="officer-pass-1",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.REGIONAL_OFFICER,
            zone_code=cls.zone.code,
            account_state=AccountState.ACTIVE,
        )

    def setUp(self) -> None:
        self.client = APIClient()

    def _post(self, body: dict, user=None, with_challenge: bool = True):
        if user is not None:
            _login(self.client, user)
        if with_challenge:
            body = {**body, **_mint_challenge(self.client)}
        return self.client.post(URL, body, format="json")

    # ---- Layer 1 ------------------------------------------------------

    def test_anonymous_is_rejected(self) -> None:
        response = self.client.post(URL, GOOD_BODY, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_master_admin_is_rejected(self) -> None:
        response = self._post(GOOD_BODY, user=self.officer)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_door_requires_mfa(self) -> None:
        self.client.force_authenticate(user=self.master)
        response = self.client.post(URL, GOOD_BODY, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ---- Layer 2 ------------------------------------------------------

    def test_wrong_confirm_phrase_returns_the_template(self) -> None:
        body = dict(GOOD_BODY, confirm="yes-do-it")
        response = self._post(body, user=self.master)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("HARD-RESET-FOR-HANDOVER", response.json()["error"])

    # ---- Layer 3: the PIN is the FIRST secret checked -----------------

    def test_wrong_pin_aborts_before_anything_happens(self) -> None:
        body = dict(GOOD_BODY, pin="000000")
        with mock.patch(
            "apps.data_admin.views.HardResetView._create_checkpoint"
        ) as checkpoint:
            response = self._post(body, user=self.master)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.json()["error"], "Invalid handover PIN. Reset aborted."
        )
        # The wrong PIN must never reach the checkpoint or the wipe.
        checkpoint.assert_not_called()
        self.assertTrue(Club.objects.filter(pk=self.club.pk).exists())

    def test_missing_pin_is_rejected(self) -> None:
        body = {k: v for k, v in GOOD_BODY.items() if k != "pin"}
        response = self._post(body, user=self.master)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unconfigured_pin_digest_refuses_everything(self) -> None:
        """No stored digest -> no PIN can ever match. Fail closed."""
        body = dict(GOOD_BODY, pin=PIN)
        with override_settings(HANDOVER_PIN_SHA256=""):
            response = self._post(body, user=self.master)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ---- Layer 4 ------------------------------------------------------

    def test_missing_password_is_401(self) -> None:
        body = {k: v for k, v in GOOD_BODY.items() if k != "password"}
        response = self._post(body, user=self.master)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_wrong_password_is_403_and_leaves_data(self) -> None:
        body = dict(GOOD_BODY, password="not-the-password")
        response = self._post(body, user=self.master)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Club.objects.filter(pk=self.club.pk).exists())

    # ---- Layer 4b: Dual-Layer Security Challenge (0018) ---------------

    def test_missing_challenge_is_rejected(self) -> None:
        response = self._post(GOOD_BODY, user=self.master, with_challenge=False)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn(
            'Security challenge expired or already used.',
            response.json()['error'],
        )
        self.assertTrue(Club.objects.filter(pk=self.club.pk).exists())

    def test_wire_replay_of_burned_challenge_is_rejected(self) -> None:
        _login(self.client, self.master)
        fields = _mint_challenge(self.client)
        # A wrong-turf (Central Admin) password burns the challenge - one-shot.
        bad = dict(GOOD_BODY, password=CENTRAL_PASSWORD, **fields)
        self.client.post(URL, bad, format="json")
        replay = dict(GOOD_BODY, **fields)
        response = self.client.post(URL, replay, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn(
            'Security challenge expired or already used.',
            response.json()['error'],
        )
        self.assertTrue(Club.objects.filter(pk=self.club.pk).exists())

    def test_wrong_turf_password_is_rejected(self) -> None:
        User.objects.create_user(
            username="centraladm",
            email="centraladm@example.test",
            password=CENTRAL_PASSWORD,
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
            account_state=AccountState.ACTIVE,
        )
        body = dict(GOOD_BODY, password=CENTRAL_PASSWORD)
        response = self._post(body, user=self.master)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Invalid Master Admin password', response.json()['error'])
        self.assertTrue(Club.objects.filter(pk=self.club.pk).exists())

    def test_central_admin_house_is_denied_at_the_gate(self) -> None:
        """Even with its OWN correct password the Central Admin house is
        refused: red-zone is SUPEROPS house only (owner 2026-10-27 21:29)."""
        central = User.objects.create_user(
            username="centraladm2",
            email="centraladm2@example.test",
            password=CENTRAL_PASSWORD,
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
            account_state=AccountState.ACTIVE,
        )
        response = self._post(GOOD_BODY, user=central)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Club.objects.filter(pk=self.club.pk).exists())

    # ---- Layer 5: never destroy without a net -------------------------

    def test_failed_checkpoint_aborts_and_data_is_untouched(self) -> None:
        """THE critical pin: no checkpoint -> no wipe, ever."""
        with mock.patch(
            "apps.data_admin.views.HardResetView._create_checkpoint",
            return_value=None,
        ):
            response = self._post(GOOD_BODY, user=self.master)
        self.assertEqual(
            response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR
        )
        self.assertIn("data is untouched", response.json()["error"])
        self.assertTrue(Club.objects.filter(pk=self.club.pk).exists())
        self.assertEqual(Club.objects.count(), 1)
        self.assertFalse(
            AuditLog.objects.filter(action="hard_reset.completed").exists()
        )
        # PG-parity pin: the abort audit row must FIT the audit column and
        # must not poison the transaction (CI: varchar overflow on Postgres).
        abort_row = AuditLog.objects.get(action="hard_reset.aborted")
        self.assertEqual(abort_row.outcome, "checkpoint_failed")

    def test_wipe_exception_audits_failure_with_error_detail(self) -> None:
        """Free-text errors go to ``detail`` - never to the short
        ``outcome`` column (overflow there broke PG transactions)."""
        with mock.patch(
            "apps.data_admin.views.HardResetView._create_checkpoint",
            return_value={"success": True, "backup_id": "bk-1"},
        ), mock.patch(
            "apps.data_admin.views.hard_reset_for_handover",
            side_effect=RuntimeError("x" * 300),
        ):
            response = self._post(GOOD_BODY, user=self.master)
        self.assertEqual(
            response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR
        )
        row = AuditLog.objects.get(action="hard_reset.failed")
        self.assertEqual(row.outcome, "failure")
        self.assertEqual(row.detail["error"], "x" * 200)
        # A failed audit write must leave the transaction usable.
        self.assertTrue(Club.objects.filter(pk=self.club.pk).exists())


@override_settings(HANDOVER_PIN_SHA256=PIN_SHA256)
class HardResetWipeTests(TestCase):
    """The wipe itself: skeleton kept, business data gone, no reseed."""
    # Fixture attributes created in setUpTestData/setUp (declared for mypy).
    client: Any
    club: Club
    grievance: GrievanceTicket
    inst: Institution
    master: Any
    state: State
    zone: Zone

    @classmethod
    def setUpTestData(cls) -> None:
        cls.zone = Zone.objects.create(code="N1", name="North 1")
        cls.state = State.objects.create(
            code="UP", name="Uttar Pradesh", zone=cls.zone
        )
        cls.inst = Institution.objects.create(
            code="INST-N1", legacy_id="LEG-N1", name="N1 Institute", state=cls.state
        )
        cls.club = Club.objects.create(
            code="CLUB-A", institution=cls.inst, name="Alpha Club"
        )
        cls.master = User.objects.create_user(
            username="master",
            email="master@example.test",
            password=MASTER_PASSWORD,
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.SUPER_ADMIN_OPS,
            account_state=AccountState.ACTIVE,
        )
        cls.grievance = GrievanceTicket.objects.create(
            club=cls.club,
            raised_by=cls.master,
            state_code=cls.state.code,
            zone_code=cls.zone.code,
            subject="Broken projector",
            description="The projector in Lab 3 is dead.",
            # Normally derived by the intake service (72h reminder, 30d admin).
            reminder_due_at=timezone.now() + timedelta(hours=72),
            admin_reminder_due_at=timezone.now() + timedelta(days=30),
        )

    def setUp(self) -> None:
        self.client = APIClient()
        _login(self.client, self.master)

    def _run(self):
        with mock.patch(
            "apps.data_admin.views.HardResetView._create_checkpoint",
            return_value={"success": True, "backup_id": "bk-1"},
        ):
            return self.client.post(
                URL, {**GOOD_BODY, **_mint_challenge(self.client)}, format="json"
            )

    def test_wipe_removes_business_data_keeps_skeleton(self) -> None:
        response = self._run()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.json()
        self.assertTrue(payload["success"])

        # business data gone
        self.assertFalse(Club.objects.exists())
        self.assertFalse(GrievanceTicket.objects.exists())

        # provisioned skeleton survives
        self.assertEqual(User.objects.count(), 1)
        self.assertTrue(Zone.objects.filter(pk=self.zone.pk).exists())
        self.assertTrue(State.objects.filter(pk=self.state.pk).exists())
        self.assertTrue(Institution.objects.filter(pk=self.inst.pk).exists())

    def test_response_reports_the_checkpoint_id(self) -> None:
        payload = self._run().json()
        self.assertEqual(payload["checkpoint_backup_id"], "bk-1")
        self.assertIn("checkpoint", payload["message"].lower())

    def test_no_reseed_happens(self) -> None:
        """Legacy semantics: blank-but-provisioned, never reseeded."""
        self._run()
        self.assertFalse(Club.objects.exists())
        self.assertEqual(User.objects.count(), 1)

    def test_wipe_is_recorded_in_the_audit_trail(self) -> None:
        self._run()
        self.assertTrue(
            AuditLog.objects.filter(action="hard_reset.completed").exists()
        )

    def test_keep_and_wipe_sets_are_disjoint(self) -> None:
        keep = set(KEEP_MODELS)
        wipe = set(WIPE_MODELS)
        self.assertFalse(keep & wipe, "a model is in BOTH keep and wipe sets")

    def test_wipe_manifest_names_every_wipe_model(self) -> None:
        names = {row["model"] for row in wipe_manifest()}
        expected = {
            f"{m._meta.app_label}.{m._meta.model_name}" for m in WIPE_MODELS
        }
        self.assertEqual(names, expected)

    def test_audit_trail_is_retained_by_design(self) -> None:
        """The ledger is append-only; a hard reset is not a way to erase history.

        Pre-reset rows survive, the reset itself is appended as one honest row,
        and the model physically refuses deletion.
        """
        AuditLog.objects.create(action="some.earlier.action", outcome="ok")

        self._run()

        self.assertTrue(
            AuditLog.objects.filter(action="some.earlier.action").exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(action="hard_reset.completed").exists()
        )

    def test_audit_log_refuses_deletion(self) -> None:
        """Pinned: the tamper-evidence guard must never be bypassed."""
        row = AuditLog.objects.create(action="x", outcome="ok")
        with self.assertRaises(PermissionError):
            row.delete()
        with self.assertRaises(PermissionError):
            AuditLog.objects.all().delete()

    def test_every_project_model_is_classified(self) -> None:
        """Coverage gate: no model may ship unclassified (no ticking bombs)."""
        self.assertEqual(
            unclassified_models(),
            [],
            "classify new models in KEEP_MODELS / WIPE_MODELS / EXEMPT_MODELS",
        )

    def test_exempt_set_is_only_the_immutable_ledger(self) -> None:
        self.assertEqual(tuple(EXEMPT_MODELS), (AuditLog,))


class HardResetServiceTests(TestCase):
    """Direct service behaviour, independent of the HTTP guard."""

    def test_service_keeps_accounts_and_geography(self) -> None:
        zone = Zone.objects.create(code="N1", name="North 1")
        state = State.objects.create(code="UP", name="Uttar Pradesh", zone=zone)
        inst = Institution.objects.create(
            code="INST-N1", legacy_id="LEG-N1", name="N1", state=state
        )
        Club.objects.create(code="CLUB-A", institution=inst, name="Alpha")
        User.objects.create_user(
            username="master",
            email="master@example.test",
            password="x",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.SUPER_ADMIN_OPS,
            account_state=AccountState.ACTIVE,
        )

        result = hard_reset_for_handover(actor_label="master")

        self.assertEqual(result["accounts_kept"], 1)
        self.assertEqual(User.objects.count(), 1)
        self.assertFalse(Club.objects.exists())
        self.assertTrue(Zone.objects.exists())
        self.assertTrue(Institution.objects.exists())
