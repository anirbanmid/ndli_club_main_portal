# Fix C3 migration side effects on production database.
#
# Migration 0013_fix_hardcoded_migration_passwords may have partially executed
# on production, setting must_change_password=True on club authority accounts.
# This migration resets those accounts to a usable state.
#
# Runs automatically on `python manage.py migrate` — no shell access required.

from __future__ import annotations

from django.db import migrations


def reset_demo_account_passwords(apps, schema_editor) -> None:
    """Reset must_change_password for authority accounts affected by migration 0013."""
    User = apps.get_model("accounts", "User")

    # Reset must_change_password for all club authority accounts
    affected = User.objects.filter(
        category="club_admin",
        sub_role__in=[
            "regional_officer",
            "central_admin",
            "club_president",
            "club_secretary",
            "club_executive",
            "club_patron",
        ],
        must_change_password=True,
    )
    affected.update(must_change_password=False)


def noop_reverse(apps, schema_editor) -> None:
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("domain", "0012_seed_dummy_schools"),
    ]

    operations = [
        migrations.RunPython(reset_demo_account_passwords, noop_reverse),
    ]
