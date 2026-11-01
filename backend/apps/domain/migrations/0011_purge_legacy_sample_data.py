# Generated for SSOT: permanently purge legacy prototype sample clubs and institutions

from django.db import migrations


def purge_sample_data(apps, schema_editor):
    Institution = apps.get_model("domain", "Institution")
    Club = apps.get_model("domain", "Club")
    Membership = apps.get_model("domain", "Membership")
    AuthorityAssignment = apps.get_model("domain", "AuthorityAssignment")
    User = apps.get_model("accounts", "User")

    try:
        JoinRequest = apps.get_model("members", "JoinRequest")
    except LookupError:
        JoinRequest = None

    try:
        StudentMemberProfile = apps.get_model("members", "StudentMemberProfile")
    except LookupError:
        StudentMemberProfile = None

    try:
        ClubEvent = apps.get_model("activities", "ClubEvent")
    except LookupError:
        ClubEvent = None

    try:
        Certificate = apps.get_model("certificates", "Certificate")
    except LookupError:
        Certificate = None

    sample_clubs = list(Club.objects.filter(is_sample=True))
    sample_insts = list(Institution.objects.filter(name__icontains="sample"))

    if not sample_clubs and not sample_insts:
        return

    if JoinRequest:
        JoinRequest.objects.filter(club__in=sample_clubs).delete()

    if StudentMemberProfile:
        StudentMemberProfile.objects.filter(club__in=sample_clubs).delete()

    if ClubEvent:
        ClubEvent.objects.filter(host_club__in=sample_clubs).delete()

    if Certificate:
        Certificate.objects.filter(club__in=sample_clubs).delete()

    Membership.objects.filter(club__in=sample_clubs).delete()
    AuthorityAssignment.objects.filter(club__in=sample_clubs).delete()
    User.objects.filter(club__in=sample_clubs).delete()
    User.objects.filter(institution__in=sample_insts).delete()

    Club.objects.filter(id__in=[c.id for c in sample_clubs]).delete()
    Institution.objects.filter(id__in=[i.id for i in sample_insts]).delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("domain", "0010_zero_canonical_club_activity_counts"),
    ]

    operations = [
        migrations.RunPython(purge_sample_data, noop),
    ]
