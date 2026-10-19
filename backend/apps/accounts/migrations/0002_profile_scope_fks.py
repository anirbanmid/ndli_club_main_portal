# Data-safe FK swap of the Profile scope keys (BRIEF_M2.md §2b, M2-A5).
#
# The four columns keep BOTH their names (db_column="*_code") and their
# varchar(64) code-string contents — every M1-era row keeps working after
# the swap. Everything except the one new index is STATE-ONLY
# (SeparateDatabaseAndState with empty database_operations): the database
# keeps exactly the columns and indexes it had in M1, so the migration is
# trivially reversible in both directions and never rewrites data.
#
# The domain relations deliberately carry db_constraint=False: M1-era rows
# hold plain codes that may not (yet) resolve to domain rows;
# `manage.py verify_domain` reports them (the P5 heal list) and the domain
# graph wins over the soft key when both are present (domain.assignments).

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
        ("domain", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                # Old index state (same names/coming back over the same
                # columns below -> zero DB churn).
                migrations.RemoveIndex(
                    model_name="profile",
                    name="accounts_pr_institu_d792b3_idx",
                ),
                migrations.RemoveIndex(
                    model_name="profile",
                    name="accounts_pr_club_co_4bb996_idx",
                ),
                migrations.RemoveIndex(
                    model_name="profile",
                    name="accounts_pr_zone_co_65ebe0_idx",
                ),
                # Swap the field STATE from plain chars to soft-code FKs.
                migrations.RemoveField(
                    model_name="profile",
                    name="club_code",
                ),
                migrations.RemoveField(
                    model_name="profile",
                    name="institution_code",
                ),
                migrations.RemoveField(
                    model_name="profile",
                    name="state_code",
                ),
                migrations.RemoveField(
                    model_name="profile",
                    name="zone_code",
                ),
                migrations.AddField(
                    model_name="profile",
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
                    model_name="profile",
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
                    model_name="profile",
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
                    model_name="profile",
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
                # Same names + same columns as the removed ones -> state-only.
                migrations.AddIndex(
                    model_name="profile",
                    index=models.Index(
                        fields=["institution"], name="accounts_pr_institu_d792b3_idx"
                    ),
                ),
                migrations.AddIndex(
                    model_name="profile",
                    index=models.Index(
                        fields=["club"], name="accounts_pr_club_co_4bb996_idx"
                    ),
                ),
                migrations.AddIndex(
                    model_name="profile",
                    index=models.Index(
                        fields=["zone"], name="accounts_pr_zone_co_65ebe0_idx"
                    ),
                ),
            ],
        ),
        # The ONE real DDL of this migration: the state scope index
        # (query pattern: officer routing / scoping by state, P2 index plan).
        migrations.AddIndex(
            model_name="profile",
            index=models.Index(
                fields=["state"], name="accounts_pr_state_c_0a5d7c_idx"
            ),
        ),
    ]
