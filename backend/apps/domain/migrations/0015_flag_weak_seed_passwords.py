# C3 (non-destructive redo): neutralise repo-public weak passwords left behind
# by the seed migrations (0004-0006 canonical clubs, 0012 dummy schools)
# WITHOUT locking anyone out.
#
# The earlier destructive attempt set ``password = "!"`` and broke login for
# seeded accounts (an orphaned 0013 row exists on production; the file must
# never be recreated in that form). This redo ONLY:
#
#   * sets ``must_change_password = True`` on accounts whose stored hash
#     still matches a known weak seed password, so the next login forces a
#     password change through the normal change-password flow;
#   * never rewrites a password hash (no account can be locked out);
#   * never touches IIT Kgp module accounts (Super admin / Central Admin /
#     EMP01-07) — those must remain accessible with their existing passwords;
#   * deliberately does NOT include ``Password@123``: those are the member
#     test accounts required for development-phase testing and are purged
#     together with all club/member data at client handover.
#
# Runs automatically on `python manage.py migrate` — no shell access required.

from __future__ import annotations

from django.contrib.auth.hashers import check_password
from django.db import migrations

#: Weak passwords written by the historical seed migrations.
KNOWN_WEAK_PASSWORDS = (
    "NdliClub@2026!",
    "NdliOffice@2026!",
    "Dummy123456",
)


def flag_weak_seed_passwords(apps, schema_editor) -> None:
    """Flag (never rewrite) accounts still holding a weak seed password."""
    User = apps.get_model("accounts", "User")

    flagged = 0
    for user in User.objects.all().iterator():
        # IIT Kgp module accounts stay untouched (handover rule).
        if user.category == "iit_kgp_admin":
            continue
        stored = user.password or ""
        # Unusable marker or empty hash: nothing to compare, and rewriting
        # would risk a lockout — leave it to the recovery migration.
        if not stored or stored.startswith("!"):
            continue
        for weak in KNOWN_WEAK_PASSWORDS:
            try:
                matches = check_password(weak, stored)
            except ValueError:
                # Unrecognised hasher — not one of ours.
                matches = False
            if matches:
                if not user.must_change_password:
                    user.must_change_password = True
                    user.save(update_fields=["must_change_password"])
                    flagged += 1
                break

    print(f"[0015_flag_weak_seed_passwords] flagged {flagged} account(s)")


def noop_reverse(apps, schema_editor) -> None:
    """Irreversible by design (flag is idempotent and forward-only)."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_rename_user_table"),
        ("domain", "0014_reset_demo_account_passwords"),
    ]

    operations = [
        migrations.RunPython(flag_weak_seed_passwords, noop_reverse),
    ]
