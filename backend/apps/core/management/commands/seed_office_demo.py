"""Seed the office demo identities (owner 2026-10-27).

"I'll need the ID and Password Admin and employees to test."

Creates the office login-gate test identities idempotently (safe to re-run —
resets the known demo passwords on every run so the documented credentials
always work):

* MASTER ADMIN:   SUPEROPS   (super_admin_ops)   — the Dual-Layer Challenge
                  re-auth identity for sensitive actions (client standard §2)
* ADMIN:          CENTRALADM (central_admin)
* EMPLOYEES:      EMP01..EMP07 (regional_officer, one per zone)
* CLUB SIDE:      DEMOCLUB1 (club_admin), DEMOSTU1 (student_member)

Passwords follow the documented scheme in the delivery guide and satisfy the
M1 password policy (>= 10 chars, not denylisted). Stored with the CLIENT
password standard: PBKDF2-HMAC-SHA256, 100,000 rounds, 16-byte random salts
(apps/accounts/hashers.py::PBKDF2ClientHasher).
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.accounts.models import AccountState, Category, SubRole

#: (username, category, sub_role, zone_code, password)
IDENTITIES: list[tuple[str, str, str, str, str]] = [
    ("SUPEROPS", Category.IIT_KGP_ADMIN, SubRole.SUPER_ADMIN_OPS, "", "Ndli@Super2026"),
    ("CENTRALADM", Category.IIT_KGP_ADMIN, SubRole.CENTRAL_ADMIN, "", "Ndli@Central2026"),
    ("EMP01", Category.IIT_KGP_ADMIN, SubRole.REGIONAL_OFFICER, "NORTH", "Ndli@Emp012026"),
    ("EMP02", Category.IIT_KGP_ADMIN, SubRole.REGIONAL_OFFICER, "SOUTH", "Ndli@Emp022026"),
    ("EMP03", Category.IIT_KGP_ADMIN, SubRole.REGIONAL_OFFICER, "EAST", "Ndli@Emp032026"),
    ("EMP04", Category.IIT_KGP_ADMIN, SubRole.REGIONAL_OFFICER, "WEST", "Ndli@Emp042026"),
    ("EMP05", Category.IIT_KGP_ADMIN, SubRole.REGIONAL_OFFICER, "CENTRAL", "Ndli@Emp052026"),
    ("EMP06", Category.IIT_KGP_ADMIN, SubRole.REGIONAL_OFFICER, "NORTH_EAST", "Ndli@Emp062026"),
    ("EMP07", Category.IIT_KGP_ADMIN, SubRole.REGIONAL_OFFICER, "", "Ndli@Emp072026"),
    ("DEMOCLUB1", Category.CLUB_ADMIN, SubRole.CLUB_SECRETARY, "", "Ndli@Club2026"),
    ("DEMOSTU1", Category.STUDENT_MEMBER, SubRole.STUDENT_MEMBER, "", "Ndli@Student2026"),
]


class Command(BaseCommand):
    help = "Seed the office demo identities (admin + employees + club demo)."

    def handle(self, *args: object, **options: object) -> None:
        user_model = get_user_model()
        for username, category, sub_role, zone_code, password in IDENTITIES:
            user, created = user_model.objects.get_or_create(
                username=username,
                defaults={
                    "email": f"{username.lower()}@club.ndl.iitkgp.ac.in",
                    "category": category,
                    "sub_role": sub_role,
                    "zone_code": zone_code,
                    "account_state": AccountState.ACTIVE,
                    "must_change_password": False,
                },
            )
            # Idempotent reset: documented demo passwords always work.
            user.category = category
            user.sub_role = sub_role
            user.zone_code = zone_code
            user.account_state = AccountState.ACTIVE
            user.must_change_password = False
            user.set_password(password)
            user.save()
            verb = "created" if created else "reset"
            self.stdout.write(f"{username:<11} {category:<15} {sub_role:<18} {verb}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Office demo identities ready ({len(IDENTITIES)} accounts). "
                "Passwords per the delivery guide / ndli_main_portal/"
                "CLIENT_SECURITY_STANDARD.md."
            )
        )
