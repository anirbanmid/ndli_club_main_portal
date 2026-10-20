"""Enable ``pg_trgm`` + the trigram index for directory search (M3-2).

PostgreSQL-only by design (M3-A5): the extension and the GIN trigram index
are created via raw SQL behind a vendor guard, so the SQLite test/dev
database simply skips them and nothing else changes. Reversible on purpose
(P5: bounded, no data destruction).
"""
from __future__ import annotations

from django.db import migrations, models


def _enable_pg_trgm(apps: object, schema_editor: object) -> None:
    connection = getattr(schema_editor, "connection", None)
    if connection is None or connection.vendor != "postgresql":
        return
    with connection.cursor() as cursor:
        cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        # Trigram index over the public name search column (P1: national
        # scale from day one; indexed search, never LIKE over big tables).
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS domain_inst_name_trgm_idx "
            "ON domain_institution USING gin (name gin_trgm_ops)"
        )


def _disable_pg_trgm(apps: object, schema_editor: object) -> None:
    connection = getattr(schema_editor, "connection", None)
    if connection is None or connection.vendor != "postgresql":
        return
    with connection.cursor() as cursor:
        cursor.execute("DROP INDEX IF EXISTS domain_inst_name_trgm_idx")
        cursor.execute("DROP EXTENSION IF EXISTS pg_trgm")


class Migration(migrations.Migration):
    dependencies = [
        ("domain", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(_enable_pg_trgm, _disable_pg_trgm),
    ]
