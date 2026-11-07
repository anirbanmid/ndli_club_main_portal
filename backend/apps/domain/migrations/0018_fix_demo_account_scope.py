# Owner scope fix 2026-11-08 — re-run the demo-account SSOT so every
# database converges on the corrected demo pair:
#
#   * REMOVES the wrongly-scoped legacy pair demo.pres.dati / demo.pres.iitkgp
#     (they were IIT Kgp Central Admins — an unwanted duplicate of the real
#     central-admin login; the command purges them with audit rows).
#   * CREATES/REFRESHES the corrected pair demo.club.bhu / demo.club.iitkgp
#     (category club_admin / sub-role club_president — full read+edit of the
#     BHU + IIT Kharagpur club dashboards, never the admin module).
#
# Production has no shell access, so the single-source-of-truth management
# command `seed_demo_accounts` is invoked from here (same pattern as 0017).
# The command is idempotent and writes immutable AuditLog rows.
#
# Runs automatically on `python manage.py migrate` — no shell access required.

from __future__ import annotations

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import migrations


def fix_demo_account_scope(apps, schema_editor) -> None:
    """Re-run the SSOT demo-account command (idempotent).

    Same downgrade contract as 0017: on a brand-new database the canonical
    institutions may not exist yet, so the command's ``CommandError`` is a
    warning, not a migration failure.
    """
    try:
        call_command("seed_demo_accounts", verbosity=0)
    except CommandError as exc:
        print(
            "[0018_fix_demo_account_scope] SKIPPED — canonical institution "
            f"data not seeded yet on this database: {exc}"
        )


def noop_reverse(apps, schema_editor) -> None:
    """Irreversible by design (demo rows are purged via --clean at handover)."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("domain", "0017_seed_demo_accounts"),
    ]

    operations = [
        migrations.RunPython(fix_demo_account_scope, noop_reverse),
    ]
