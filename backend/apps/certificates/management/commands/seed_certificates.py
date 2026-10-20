"""``manage.py seed_certificates`` — the SAMPLE-ONLY certificate fixtures (M3).

Thin command wrapper over :func:`apps.certificates.seed.load_certificate_samples`:
loads ``data/samples/certificates.json`` idempotently (safe to re-run), with a
bounded, guarded ``--reset`` and a hard production guard. The loader itself —
validation, signing, bounded reset, audit — lives in
:mod:`apps.certificates.seed`.
"""
from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError

from apps.certificates.seed import SeedValidationError, load_certificate_samples


class Command(BaseCommand):
    help = (
        "Load the SAMPLE-ONLY certificate fixtures from data/samples/ "
        "(idempotent). Reset is bounded to fixture rows and refused in "
        "production without --allow-production."
    )

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--reset",
            action="store_true",
            help="first remove ONLY the fixture rows (bounded)",
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
        try:
            result = load_certificate_samples(
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
