"""Management command to audit and heal the Single Source of Truth (SSOT) Ledger.

Usage:
    python backend/manage.py reconcile_ledger [--strict]
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from apps.domain.integrity import LedgerIntegrityEngine


class Command(BaseCommand):
    help = "Audit and auto-heal the SSOT between Clubs and Activity Logs."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--strict",
            action="store_true",
            help="Raise an error if any unresolvable deviation is detected.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        self.stdout.write(self.style.NOTICE("Auditing and reconciling SSOT Ledger..."))
        report = LedgerIntegrityEngine.audit_and_heal()

        for d in report.details:
            if d.startswith("UNRESOLVED"):
                self.stdout.write(self.style.ERROR(d))
            else:
                self.stdout.write(self.style.SUCCESS(d))

        summary = (
            f"Ledger reconciliation completed: {report.healed_approvals_count} "
            f"clubs verified/healed, {report.unresolved_deviations_count} "
            "unresolved deviations."
        )
        self.stdout.write(self.style.SUCCESS(summary))

        if not report.healthy and options.get("strict"):
            raise SystemExit("Integrity check failed: deviations detected in ledger.")
