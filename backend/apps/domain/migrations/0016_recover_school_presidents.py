# Non-destructive recovery of the five seeded school President accounts
# (created by 0012_seed_dummy_schools, @school.test / Dummy123456).
#
# The earlier destructive C3 attempt left these accounts on production with an
# unusable/unknown password: they exist (forgot-check 200) but reject every
# known password, so School admin test sign-in is broken. This migration
# restores ONLY these five accounts to their documented demo password and
# active state:
#
#   * matches strictly by the five seeded president emails (any other account
#     — including every IIT Kgp module account — is never touched);
#   * only rewrites the password when it is unusable ("!") or is not already
#     the documented demo password (an account that already matches is left
#     alone, so re-running is a no-op);
#   * clears must_change_password so the accounts have FULL functional
#     access for development-phase testing;
#   * restores is_active/account_state because a disabled seed account would
#     still be unable to log in.
#
# Demo data: these accounts are deleted together with all school/club data
# before client handover; IIT Kgp module accounts remain untouched.
#
# Runs automatically on `python manage.py migrate` — no shell access required.

from __future__ import annotations

from django.contrib.auth.hashers import check_password, make_password
from django.db import migrations

#: Documented demo password for every seeded school president (0012).
DEMO_PASSWORD = "Dummy123456"

#: The exact five president emails seeded by 0012_seed_dummy_schools.
SEEDED_PRESIDENT_EMAILS = (
    "president.springdale@school.test",
    "president.shreevidya@school.test",
    "president.sunrise@school.test",
    "president.greenvalley@school.test",
    "president.bvb@school.test",
)


def recover_school_presidents(apps, schema_editor) -> None:
    """Restore the seeded school presidents to a usable demo password."""
    User = apps.get_model("accounts", "User")

    recovered = 0
    for email in SEEDED_PRESIDENT_EMAILS:
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            continue

        changed: list[str] = []

        stored = user.password or ""
        already_demo = False
        if stored and not stored.startswith("!"):
            try:
                already_demo = check_password(DEMO_PASSWORD, stored)
            except ValueError:
                already_demo = False

        if not already_demo:
            user.password = make_password(DEMO_PASSWORD)
            changed.append("password")

        if not user.is_active:
            user.is_active = True
            changed.append("is_active")

        if user.account_state != "active":
            user.account_state = "active"
            changed.append("account_state")

        if user.must_change_password:
            user.must_change_password = False
            changed.append("must_change_password")

        if changed:
            user.save(
                update_fields=changed + ["updated_at"],
            )
            recovered += 1

    print(
        f"[0016_recover_school_presidents] recovered {recovered} of "
        f"{len(SEEDED_PRESIDENT_EMAILS)} seeded school president account(s)"
    )


def noop_reverse(apps, schema_editor) -> None:
    """Irreversible by design (the previous hash cannot be reconstructed)."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("domain", "0015_flag_weak_seed_passwords"),
    ]

    operations = [
        migrations.RunPython(recover_school_presidents, noop_reverse),
    ]
