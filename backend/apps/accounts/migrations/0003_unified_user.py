# M2U: one person = ONE record (BRIEF_M2U.md §2b, A10 Option B — owner 2026-10-19).
#
# The M1 shape (stock ``auth.User`` + a side ``accounts_profile`` table) is
# merged into a single ``accounts.User`` model that maps onto the SAME
# physical table (``db_table = "auth_user"``, M2U-A2). That is the whole
# risk control: every user FK in the system (memberships, assignments,
# passkeys, OTPs, link tokens, recovery codes) already targets ``auth_user.id``,
# so there is ZERO foreign-key DDL on either engine.
#
# Shape of this migration (forward):
#   1. REAL DDL: add the 13 profile columns + 4 soft scope-key columns to the
#      existing ``auth_user`` table. The ``accounts.User`` MODEL is already in
#      the migration state (``accounts.0001`` registers it) and the TABLE
#      already exists on every M1/M2 database.
#   2. REAL DATA: copy every ``accounts_profile`` row onto its user row,
#      keyed by ``user_id`` (user primary keys never change — M2U-A1).
#   3. REAL DDL: drop ``accounts_profile``.
#   4. REAL DDL: the P2 index plan on the user table (U5).
#
# Reverse runs 4-1 backwards: the indexes go, the profile table is recreated,
# the columns are copied back and the added columns are dropped.
# U2 executes both directions and compares the data field by field.

import django.contrib.auth.models
import django.contrib.auth.validators
import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models

#: Profile columns copied verbatim (identity + lifecycle + MFA + lockout).
PROFILE_FIELDS = (
    "category",
    "sub_role",
    "phone",
    "alt_phone",
    "account_state",
    "must_change_password",
    "totp_secret_encrypted",
    "totp_enabled",
    "totp_last_counter",
    "failed_login_count",
    "locked_until",
    "created_at",
    "updated_at",
)

#: The four soft scope keys (legacy ``*_code`` columns, M2-A5).
SCOPE_KEYS = ("institution_id", "club_id", "state_id", "zone_id")


def merge_profiles_into_users(apps, schema_editor):
    """Copy every profile row onto its user row (one row per person)."""
    User = apps.get_model("accounts", "User")
    Profile = apps.get_model("accounts", "Profile")
    for row in Profile.objects.all().iterator():
        values = {name: getattr(row, name) for name in PROFILE_FIELDS}
        values.update({name: (getattr(row, name) or "") for name in SCOPE_KEYS})
        # .update() bypasses auto_now/auto_now_add, so the timestamps that
        # were recorded on the profile survive the merge byte-for-byte.
        User.objects.filter(pk=row.user_id).update(**values)


def split_users_back_to_profiles(apps, schema_editor):
    """Reverse: restore one profile row per user (the profile columns only)."""
    User = apps.get_model("accounts", "User")
    Profile = apps.get_model("accounts", "Profile")
    for row in User.objects.all().iterator():
        values = {name: getattr(row, name) for name in PROFILE_FIELDS}
        values.update({name: (getattr(row, name) or "") for name in SCOPE_KEYS})
        # ``id`` is regenerated (M2U-A1 keeps USER ids, not profile ids) and
        # ``created_at``/``updated_at`` are forced afterwards because
        # auto_now(_add) always wins inside save()/create().
        created = Profile.objects.create(user_id=row.pk, **values)
        Profile.objects.filter(pk=created.pk).update(
            created_at=row.created_at,
            updated_at=row.updated_at,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_profile_scope_fks"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("domain", "0001_initial"),
    ]

    operations = [
        # ---------------------------------------------------------------
        # 1. REAL DDL: the 17 new columns on the EXISTING auth_user table.
        # ---------------------------------------------------------------
        migrations.AddField(
            model_name="user",
            name="category",
            field=models.CharField(
                choices=[
                    ("general_public", "General Public"),
                    ("club_admin", "Club Admin"),
                    ("student_member", "Student Member"),
                    ("iit_kgp_admin", "IIT KGP Admin"),
                ],
                default="",
                max_length=32,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="user",
            name="sub_role",
            field=models.CharField(
                choices=[
                    ("anonymous", "Anonymous"),
                    ("club_executive", "Club Executive"),
                    ("club_secretary", "Club Secretary"),
                    ("club_president", "Club President"),
                    ("club_patron", "Club Patron"),
                    ("student_member", "Student Member"),
                    ("central_admin", "Central Admin"),
                    ("regional_officer", "Regional Officer"),
                    ("super_admin_ops", "Super Admin (ops)"),
                ],
                default="",
                max_length=32,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="user",
            name="phone",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
        migrations.AddField(
            model_name="user",
            name="alt_phone",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
        migrations.AddField(
            model_name="user",
            name="account_state",
            field=models.CharField(
                choices=[
                    ("pending_approval", "Pending approval"),
                    ("active", "Active"),
                    ("locked", "Locked"),
                    ("dormant", "Dormant"),
                ],
                default="pending_approval",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="must_change_password",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="totp_secret_encrypted",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="user",
            name="totp_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="totp_last_counter",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="failed_login_count",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="user",
            name="locked_until",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="created_at",
            field=models.DateTimeField(
                default=django.utils.timezone.now, auto_now_add=True
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="user",
            name="updated_at",
            field=models.DateTimeField(
                default=django.utils.timezone.now, auto_now=True
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="user",
            name="club",
            field=models.ForeignKey(
                blank=True,
                db_column="club_code",
                db_constraint=False,
                default="",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="profiles",
                to="domain.club",
                to_field="code",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="institution",
            field=models.ForeignKey(
                blank=True,
                db_column="institution_code",
                db_constraint=False,
                default="",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="profiles",
                to="domain.institution",
                to_field="code",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="state",
            field=models.ForeignKey(
                blank=True,
                db_column="state_code",
                db_constraint=False,
                default="",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="profiles",
                to="domain.state",
                to_field="code",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="zone",
            field=models.ForeignKey(
                blank=True,
                db_column="zone_code",
                db_constraint=False,
                default="",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="profiles",
                to="domain.zone",
                to_field="code",
            ),
        ),
        # ---------------------------------------------------------------
        # 2. REAL DATA: profile row -> user row (user PKs never change).
        # ---------------------------------------------------------------
        migrations.RunPython(
            merge_profiles_into_users,
            split_users_back_to_profiles,
        ),
        # ---------------------------------------------------------------
        # 3. REAL DDL: the side table is gone (M2U-A4: no shim left behind).
        # ---------------------------------------------------------------
        migrations.DeleteModel(
            name="Profile",
        ),
        # ---------------------------------------------------------------
        # 4. REAL DDL: the P2 index plan on the hottest table of the portal
        #    (U5 pins the presence of every one of them).
        # ---------------------------------------------------------------
        migrations.AddIndex(
            model_name="user",
            index=models.Index(
                fields=["category", "sub_role"],
                name="auth_user_categor_9de067_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="user",
            index=models.Index(
                fields=["institution"], name="auth_user_institu_46392f_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="user",
            index=models.Index(fields=["club"], name="auth_user_club_co_6bb4a8_idx"),
        ),
        migrations.AddIndex(
            model_name="user",
            index=models.Index(fields=["zone"], name="auth_user_zone_co_3252d4_idx"),
        ),
        migrations.AddIndex(
            model_name="user",
            index=models.Index(fields=["state"], name="auth_user_state_c_4b197f_idx"),
        ),
    ]
