"""Load the SAMPLE-ONLY development seed data.

Real seed loaders (36 States/UTs, districts, zone table, AISHE directory CSV
from data/samples/) are delivered in milestone M2. This command exists so the
Makefile ``seed`` target is wired end-to-end from M0 and fails loudly-but-
clearly rather than pretending to load data.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Load sample development seed data. Seed loaders arrive in milestone "
        "M2; see data/samples/README.md for the SAMPLE ONLY convention."
    )

    def handle(self, *args: object, **options: object) -> None:
        self.stdout.write(
            "No seed data is shipped in milestone M0.\n"
            "Sample seed files and their loaders are delivered in M2 "
            "(see data/samples/README.md)."
        )
