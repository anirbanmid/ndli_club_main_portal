# Generated for SSOT pure relational database compliance

from django.db import migrations


def zero_club_activity_counts(apps, schema_editor):
    Club = apps.get_model("domain", "Club")
    Club.objects.filter(solo_activities__gt=0).update(solo_activities=0)
    Club.objects.filter(joint_activities__gt=0).update(joint_activities=0)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("domain", "0009_zero_canonical_club_member_counts"),
    ]

    operations = [
        migrations.RunPython(zero_club_activity_counts, noop),
    ]
