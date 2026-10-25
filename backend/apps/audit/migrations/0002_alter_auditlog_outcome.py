"""Widen ``AuditLog.outcome`` from varchar(16) to varchar(64).

SQLite does not enforce ``max_length``, so longer outcome codes were
silently accepted in local runs and only raised
``StringDataRightTruncation`` on PostgreSQL (CI "Tests (pytest +
Postgres)"), which poisoned the transaction. Widening is metadata-only on
PostgreSQL and touches no stored values, so the append-only hash chain
stays intact. ``outcome`` remains a SHORT code field - free text belongs
in ``detail``.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("audit", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="auditlog",
            name="outcome",
            field=models.CharField(default="success", max_length=64),
        ),
    ]
