# Seed the development-phase demo accounts automatically on deploy:
#
#   * 2 HEI Central Admin accounts  (demo.pres.dati / demo.pres.iitkgp)
#   * 2 HEI Student Member accounts (demo.member.dati / demo.member.iitkgp)
#
# Production has no shell access, so the single-source-of-truth management
# command `seed_demo_accounts` is invoked from here instead of manually.
# The command is idempotent and writes an immutable AuditLog row per account.
#
# Explicit dependencies guarantee the tables the command touches (User,
# Institution/Club/AuthorityAssignment/Membership, StudentMemberProfile,
# AuditLog) already exist in their final shape when this runs — on a fresh
# database as well as on production.
#
# DEMO TEST DATA: all four accounts are deleted before client handover
# (`seed_demo_accounts --clean` / handover purge). IIT Kgp module accounts
# (Super admin, Central Admin, EMP01-07) are never touched by this migration.
#
# Runs automatically on `python manage.py migrate` — no shell access required.

from __future__ import annotations

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import migrations


def seed_demo_accounts(apps, schema_editor) -> None:
    """Create/refresh the four demo accounts via the SSOT command.

    On a brand-new database the canonical institutions may not be seeded yet
    (0004/0005 skip when no State rows exist), so the command's
    ``CommandError`` is downgraded to a warning here — production has the
    canonical data and creates the accounts; fresh test databases skip them.
    """
    try:
        call_command("seed_demo_accounts", verbosity=0)
    except CommandError as exc:
        print(
            "[0017_seed_demo_accounts] SKIPPED — canonical institution "
            f"data not seeded yet on this database: {exc}"
        )


def noop_reverse(apps, schema_editor) -> None:
    """Irreversible by design (demo rows are purged via --clean at handover)."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_rename_user_table"),
        ("audit", "0002_alter_auditlog_outcome"),
        ("members", "0007_schoolstudentroster_status"),
        ("domain", "0016_recover_school_presidents"),
    ]

    operations = [
        migrations.RunPython(seed_demo_accounts, noop_reverse),
    ]
