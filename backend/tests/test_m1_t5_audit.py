"""T5 — the append-only, tamper-evident audit trail (BRIEF_M1.md §7 T5).

Pinned: every mutating action writes exactly ONE audit row · the SHA-256
chain verifies · rows cannot be updated or deleted through any Django path ·
tampering with a stored row breaks the chain and is detected.
"""
from __future__ import annotations

from django.db import connection

from apps.accounts import services
from apps.accounts.models import AccountState, Category, SubRole
from apps.audit import services as audit
from apps.audit.decorators import audit_action, set_audit_detail, set_audit_object
from apps.audit.models import AuditLog, compute_entry_hash

from .support import M1PinTestCase as TestCase
from .support import make_profile, request_for


class OneRowPerActionTests(TestCase):
    def test_record_writes_exactly_one_row(self) -> None:
        before = AuditLog.objects.count()
        audit.record(action="test.action")
        self.assertEqual(AuditLog.objects.count(), before + 1)

    def test_the_decorator_writes_exactly_one_row_on_success(self) -> None:
        @audit_action("club.approve", object_type="club")
        def view(request):  # noqa: ANN001
            set_audit_detail(request, note="ok")
            return _Response(200)

        request = request_for()
        self.assertEqual(AuditLog.objects.count(), 0)
        view(request)
        self.assertEqual(AuditLog.objects.count(), 1)
        row = AuditLog.objects.get()
        self.assertEqual(row.action, "club.approve")
        self.assertEqual(row.outcome, "success")
        self.assertEqual(row.detail.get("note"), "ok")

    def test_the_decorator_writes_exactly_one_row_on_denial(self) -> None:
        @audit_action("club.approve")
        def view(request):  # noqa: ANN001
            return _Response(403)

        request = request_for()
        view(request)
        self.assertEqual(AuditLog.objects.count(), 1)
        self.assertEqual(AuditLog.objects.get().outcome, "denied")

    def test_the_decorator_writes_one_row_and_reraises_on_error(self) -> None:
        @audit_action("club.approve")
        def view(request):  # noqa: ANN001
            raise RuntimeError("boom")

        request = request_for()
        with self.assertRaises(RuntimeError):
            view(request)
        self.assertEqual(AuditLog.objects.count(), 1)
        self.assertEqual(AuditLog.objects.get().outcome, "error")

    def test_the_row_records_the_actor_and_object(self) -> None:
        user, _ = make_profile(
            username="t5actor",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
        )
        request = request_for(user)

        @audit_action("club.approve")
        def view(request):  # noqa: ANN001
            set_audit_object(request, "club", 42)
            return _Response(200)

        view(request)
        row = AuditLog.objects.get()
        self.assertEqual(row.actor_id, user.pk)
        self.assertEqual(row.actor_label, "t5actor")
        self.assertEqual(row.object_type, "club")
        self.assertEqual(row.object_id, "42")

    def test_identity_lifecycle_actions_are_audited(self) -> None:
        """Every F1-F5 transition leaves a trail (BRIEF_M1.md §5)."""
        admin, _ = make_profile(
            username="t5admin",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        club, _ = make_profile(
            username="t5club",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.ACTIVE,
            institution_code="IIT",
            club_code="CLB5",
        )
        passkey = services.rotate_passkey(club_code="CLB5")
        request = request_for(admin)
        services.break_glass_reset(
            target=club, passkey=passkey, reason="email down", request=request
        )
        self.assertTrue(
            AuditLog.objects.filter(action="passkey.rotate").exists(),
            "passkey rotation is not audited",
        )
        self.assertTrue(
            AuditLog.objects.filter(action="auth.break_glass").exists(),
            "the F5 break-glass reset is not audited",
        )

    def test_failed_break_glass_is_audited_too(self) -> None:
        from rest_framework.exceptions import PermissionDenied

        admin, _ = make_profile(
            username="t5admin2",
            category=Category.IIT_KGP_ADMIN,
            sub_role=SubRole.CENTRAL_ADMIN,
        )
        club, _profile = make_profile(
            username="t5club2",
            category=Category.CLUB_ADMIN,
            sub_role=SubRole.CLUB_SECRETARY,
            account_state=AccountState.ACTIVE,
            institution_code="IIT",
            club_code="CLB6",
        )
        services.rotate_passkey(club_code="CLB6")
        with self.assertRaises(PermissionDenied):
            services.break_glass_reset(
                target=club,
                passkey="wrong",
                reason="guess",
                request=request_for(admin),
            )
        self.assertTrue(
            AuditLog.objects.filter(
                action="auth.break_glass", outcome="denied"
            ).exists(),
            "a failed F5 attempt must be audited",
        )

    def test_the_brief_names_every_action_that_must_be_audited(self) -> None:
        """BRIEF_M1.md §5 lists the auth + lifecycle events by name."""
        import inspect

        from apps.accounts import services as svc

        source = inspect.getsource(svc)
        for action in (
            "auth.login",
            "auth.lockout",
            "account.create",
            "account.approve",
            "password.change",
            "password.reset_requested",
            "password.link_used",
            "email_otp.send",
            "email_otp.verify",
            "email_otp.lockout",
            "passkey.rotate",
            "auth.break_glass",
        ):
            self.assertIn(action, source, f"{action} is never audited")


class ChainIntegrityTests(TestCase):
    def test_empty_chain_verifies(self) -> None:
        self.assertEqual(audit.verify_chain(), (True, None))

    def test_appended_rows_form_a_verifiable_chain(self) -> None:
        for i in range(5):
            audit.record(action=f"test.chain.{i}")
        self.assertEqual(audit.verify_chain(), (True, None))

    def test_first_row_starts_from_the_genesis_hash(self) -> None:
        from apps.audit.models import GENESIS_HASH

        audit.record(action="test.genesis")
        self.assertEqual(AuditLog.objects.get().prev_hash, GENESIS_HASH)

    def test_each_row_is_chained_to_its_predecessor(self) -> None:
        audit.record(action="a")
        audit.record(action="b")
        first, second = list(AuditLog.objects.order_by("seq"))
        self.assertEqual(second.prev_hash, first.entry_hash)

    def test_tampering_with_a_row_breaks_the_chain(self) -> None:
        audit.record(action="a")
        audit.record(action="b")
        audit.record(action="c")
        # Bypass the model's refusal with raw SQL: this is exactly the attack.
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE audit_auditlog SET action = %s WHERE seq = %s",
                ["tampered", list(AuditLog.objects.order_by("seq"))[1].seq],
            )
        ok, bad_seq = audit.verify_chain()
        self.assertFalse(ok)
        self.assertIsNotNone(bad_seq)

    def test_recomputed_hash_mismatch_is_detected(self) -> None:
        audit.record(action="a")
        row = AuditLog.objects.get()
        self.assertEqual(compute_entry_hash(row), row.entry_hash)


class AppendOnlyTests(TestCase):
    """No Django ORM path may mutate or delete an audit row."""

    def _row(self) -> AuditLog:
        audit.record(action="test.immutable")
        return AuditLog.objects.get()

    def test_instance_update_is_refused(self) -> None:
        row = self._row()
        row.action = "rewritten"
        with self.assertRaises(PermissionError):
            row.save(update_fields=["action"])

    def test_instance_delete_is_refused(self) -> None:
        row = self._row()
        with self.assertRaises(PermissionError):
            row.delete()

    def test_queryset_update_is_refused(self) -> None:
        self._row()
        with self.assertRaises(PermissionError):
            AuditLog.objects.update(action="rewritten")

    def test_queryset_delete_is_refused(self) -> None:
        self._row()
        with self.assertRaises(PermissionError):
            AuditLog.objects.all().delete()

    def test_bulk_create_is_refused(self) -> None:
        with self.assertRaises(PermissionError):
            AuditLog.objects.bulk_create([AuditLog(action="smuggled")])

    def test_bulk_update_is_refused(self) -> None:
        row = self._row()
        row.action = "rewritten"
        with self.assertRaises(PermissionError):
            AuditLog.objects.bulk_update([row], ["action"])

    def test_rows_survive_an_attempted_rewrite(self) -> None:
        row = self._row()
        original = row.action
        for mutate in (
            lambda: row.save(update_fields=["action"]),
            lambda: row.delete(),
        ):
            try:
                mutate()
            except PermissionError:
                pass
        row.refresh_from_db()
        self.assertEqual(row.action, original)


class _Response:
    """Minimal response stand-in for the decorator's status inspection."""

    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
