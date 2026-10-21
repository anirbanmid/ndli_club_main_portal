from django.db import migrations


class Migration(migrations.Migration):
    """Post-M3 hygiene (MEMORY.md priority item 2): cosmetic table rename.

    ``auth_user`` -> ``accounts_user``. No data moves; Postgres re-points
    every user FK automatically on ``ALTER TABLE ... RENAME`` and SQLite
    (>= 3.25) rewrites the FK references in dependent tables as well, so
    this is a pure naming operation (M2U-A2's "zero constraint surgery"
    still holds). Legacy index names (``auth_user_*``) are intentionally
    NOT renamed — they are stable identifiers pinned by tests and renaming
    them is schema churn without value. Fully reversible.
    """

    dependencies = [
        ("accounts", "0003_unified_user"),
    ]

    operations = [
        migrations.AlterModelTable(
            name="user",
            table="accounts_user",
        ),
    ]
