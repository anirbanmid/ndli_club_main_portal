"""``manage.py verify_domain`` — read-only domain integrity report (P5).

Reports broken relations (orphan rows, assignment overlaps, scope drift) and
known-pending states (awaiting officer assignment, AISHE-less institutions).
It NEVER blocks, never mutates domain data and is safe to run at any time —
it is the future bounded auto-repair trigger point (BRIEF_M2.md §3). Every
run appends one audit row (P5: the check itself is traceable).
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError

from apps.audit import services as audit_services
from apps.domain import verify


class Command(BaseCommand):
    help = (
        "Report domain integrity findings (orphans, overlaps, scope drift) "
        "and pending notices. Read-only; never blocks."
    )

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--strict",
            action="store_true",
            help="exit non-zero when FINDINGS exist (opt-in for CI gates)",
        )

    def handle(self, *args: object, **options: object) -> None:
        report = verify.run_checks()
        for line in verify.render(report):
            self.stdout.write(line)
        audit_services.record(
            action="domain.verify",
            actor_label="verify_domain",
            object_type="domain",
            object_id="integrity",
            detail={"counts": report.counts(), "clean": report.clean},
        )
        if options.get("strict") and not report.clean:
            raise CommandError(f"{len(report.findings)} finding(s) present")
