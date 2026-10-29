"""Seed the office demo identities (owner 2026-10-27).

"I'll need the ID and Password Admin and employees to test."

Creates the office login-gate test identities idempotently (safe to re-run —
resets the documented demo credentials on every run so they always work):

* MASTER ADMIN:   SUPEROPS   (super_admin_ops)   — the Dual-Layer Challenge
                  re-auth identity for sensitive actions (client standard §2)
* ADMIN:          CENTRALADM (central_admin)
* EMPLOYEES:      EMP01..EMP07 (regional_officer, one per zone)
* CLUB SIDE:      DEMOCLUB1 (club_admin), DEMOSTU1 (student_member)

Credentials follow the documented scheme in M6D5UI4_DEPLOY_GUIDE.md and are
stored with the client password standard (PBKDF2-HMAC-SHA256, 100k rounds,
16-byte random salts — apps/accounts/hashers.py::PBKDF2ClientHasher).
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.accounts.models import AccountState
from apps.accounts.models import Category as Cat
from apps.accounts.models import SubRole as Role


def demo_password(token: str) -> str:
    """The documented demo credential scheme (see the deploy guide)."""
    return f"Ndli@{token}2026"


#: (username, category, sub_role, zone_code, password token)
IDENTITIES: list[tuple[str, str, str, str, str]] = [
    ("SUPEROPS", Cat.IIT_KGP_ADMIN, Role.SUPER_ADMIN_OPS, "", "Super"),
    ("CENTRALADM", Cat.IIT_KGP_ADMIN, Role.CENTRAL_ADMIN, "", "Central"),
    ("EMP01", Cat.IIT_KGP_ADMIN, Role.REGIONAL_OFFICER, "NORTH", "Emp01"),
    ("EMP02", Cat.IIT_KGP_ADMIN, Role.REGIONAL_OFFICER, "SOUTH", "Emp02"),
    ("EMP03", Cat.IIT_KGP_ADMIN, Role.REGIONAL_OFFICER, "EAST", "Emp03"),
    ("EMP04", Cat.IIT_KGP_ADMIN, Role.REGIONAL_OFFICER, "WEST", "Emp04"),
    ("EMP05", Cat.IIT_KGP_ADMIN, Role.REGIONAL_OFFICER, "CENTRAL", "Emp05"),
    ("EMP06", Cat.IIT_KGP_ADMIN, Role.REGIONAL_OFFICER, "NORTH_EAST", "Emp06"),
    ("EMP07", Cat.IIT_KGP_ADMIN, Role.REGIONAL_OFFICER, "", "Emp07"),
    ("DEMOCLUB1", Cat.CLUB_ADMIN, Role.CLUB_SECRETARY, "", "Club"),
    ("DEMOSTU1", Cat.STUDENT_MEMBER, Role.STUDENT_MEMBER, "", "Student"),
]


class Command(BaseCommand):
    help = "Seed the office demo identities (admin + employees + club demo)."

    def handle(self, *args: object, **options: object) -> None:
        user_model = get_user_model()
        for username, category, sub_role, zone, token in IDENTITIES:
            user, created = user_model.objects.update_or_create(
                username=username,
                defaults={
                    "email": f"{username.lower()}@club.ndl.iitkgp.ac.in",
                    "category": category,
                    "sub_role": sub_role,
                    "account_state": AccountState.ACTIVE,
                    "must_change_password": False,
                },
            )
            # Idempotent reset: documented demo credentials always work.
            # zone_code is a property over the zone FK that django-stubs
            # cannot see (model properties are invisible to its plugin).
            user.zone_code = zone  # type: ignore[misc]
            user.set_password(demo_password(token))
            user.save()
            verb = "created" if created else "reset"
            self.stdout.write(f"{username:<11} {category:<15} {sub_role:<18} {verb}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Office demo identities ready ({len(IDENTITIES)} accounts). "
                "Credentials per M6D5UI4_DEPLOY_GUIDE.md / ndli_main_portal/"
                "CLIENT_SECURITY_STANDARD.md."
            )
        )
