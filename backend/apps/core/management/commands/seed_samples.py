"""``manage.py seed_samples`` — the SAMPLE-ONLY seed loader (M2).

Thin command wrapper over ``apps.domain.seed.load_samples``: loads the JSON
files under ``data/samples/`` idempotently (safe to re-run), with a bounded,
guarded ``--reset`` and a hard production guard (M2-A4 / P5). The loader
itself — validation, natural keys, audit — lives in ``apps.domain.seed``.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError

from apps.domain.seed import SeedValidationError, is_production, load_samples


class Command(BaseCommand):
    help = (
        "Load the SAMPLE-ONLY seed data from data/samples/ (idempotent). "
        "Reset is bounded to seed rows and refused in production without "
        "--allow-production."
    )

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--reset",
            action="store_true",
            help="first remove ONLY the rows named in the seed files (bounded)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="run the full load inside a rolled-back transaction",
        )
        parser.add_argument(
            "--allow-production",
            action="store_true",
            help="explicitly allow seeding under production settings (audited)",
        )

    def handle(self, *args: object, **options: object) -> None:
        reset = bool(options.get("reset"))
        dry_run = bool(options.get("dry_run"))
        allow_production = bool(options.get("allow_production"))
        if is_production():
            self.stdout.write(
                self.style.WARNING(
                    "PRODUCTION environment detected — seeding is an explicit, "
                    "flagged, audited action (M2-A4)."
                )
            )
        try:
            result = load_samples(
                reset=reset,
                dry_run=dry_run,
                allow_production=allow_production,
            )
        except SeedValidationError as exc:
            raise CommandError(f"seed rejected: {exc}") from exc
        for entity, counts in sorted(result.counts.items()):
            self.stdout.write(
                f"{entity}: {counts.get('created', 0)} created, "
                f"{counts.get('updated', 0)} updated"
            )
        if result.removed:
            for entity, count in sorted(result.removed.items()):
                self.stdout.write(f"removed {entity}: {count}")
        self.stdout.write(
            self.style.SUCCESS(
                f"seed {'(dry-run, rolled back) ' if dry_run else ''}"
                f"{'reset + ' if reset else ''}complete: {result.total()} rows applied"
            )
        )
