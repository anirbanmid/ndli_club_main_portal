# Generated for test student accounts and sub-club seed

from datetime import date, timedelta
from django.contrib.auth.hashers import make_password
from django.db import migrations


def seed_test_students_and_subclubs(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    Club = apps.get_model("domain", "Club")
    SubClub = apps.get_model("domain", "SubClub")
    Membership = apps.get_model("domain", "Membership")
    StudentMemberProfile = apps.get_model("members", "StudentMemberProfile")
    JoinRequest = apps.get_model("members", "JoinRequest")

    creator = User.objects.filter(username="EMP01").first() or User.objects.first()

    # 1. Ensure initial disciplinary SubClubs for Banaras Hindu University
    bhu_club = Club.objects.filter(code__iexact="CLUB-BHU-008").first()
    cse_subclub = None
    if bhu_club and creator:
        cse_subclub, _ = SubClub.objects.update_or_create(
            code="CLUB-BHU-008-SUB-CSE",
            defaults={
                "club": bhu_club,
                "name": "Department of Computer Science Sub-Club",
                "discipline": "Computer Science & Engineering",
                "coordinator_name": "Dr. D. K. Rai",
                "coordinator_email": "library@bhu.example.edu",
                "coordinator_phone": "+91 9415000002",
                "created_by": creator,
                "is_active": True,
            },
        )
        SubClub.objects.update_or_create(
            code="CLUB-BHU-008-SUB-MED",
            defaults={
                "club": bhu_club,
                "name": "Institute of Medical Sciences Sub-Club",
                "discipline": "Medicine & Healthcare",
                "coordinator_name": "Prof. Anita Sharma",
                "coordinator_email": "anita@bhu.example.edu",
                "coordinator_phone": "+91 9415000003",
                "created_by": creator,
                "is_active": True,
            },
        )

    # 2. Test student definitions
    TEST_STUDENTS = [
        {
            "username": "student.bhu",
            "email": "student.bhu@bhu.ac.in",
            "first_name": "Aarav",
            "last_name": "Sharma",
            "club_code": "CLUB-BHU-008",
            "inst_code": "INST-BHU-008",
            "state_code": "UTTAR_PRADESH",
            "zone_code": "NORTH",
            "department": "Computer Science & Engineering",
            "roll_number": "BHU-2026-CS101",
            "points": 150,
            "badge": "silver",
            "gender": "male",
            "attach_subclub": cse_subclub,
        },
        {
            "username": "student.iitkgp",
            "email": "student.iitkgp@iitkgp.ac.in",
            "first_name": "Priya",
            "last_name": "Patel",
            "club_code": "CLUB-IITKGP-001",
            "inst_code": "INST-IITKGP-001",
            "state_code": "WEST_BENGAL",
            "zone_code": "EAST",
            "department": "Electronics & Electrical Comm.",
            "roll_number": "KGP-2026-EE202",
            "points": 200,
            "badge": "gold",
            "gender": "female",
            "attach_subclub": None,
        },
        {
            "username": "student.du",
            "email": "student.du@du.ac.in",
            "first_name": "Aakash",
            "last_name": "Verma",
            "club_code": "CLUB-DU-007",
            "inst_code": "INST-DU-007",
            "state_code": "DELHI",
            "zone_code": "NORTH",
            "department": "Faculty of Mathematical Sciences",
            "roll_number": "DU-2026-CS303",
            "points": 120,
            "badge": "silver",
            "gender": "male",
            "attach_subclub": None,
        },
    ]

    hashed_pw = make_password("Password@123")
    expiry = date.today() + timedelta(days=365)

    for st in TEST_STUDENTS:
        club = Club.objects.filter(code__iexact=st["club_code"]).first()
        if not club:
            club = Club.objects.first()

        inst = club.institution if club else None
        st_state = inst.state if inst else None
        st_zone = st_state.zone if st_state else None

        user_defaults = {
            "email": st["email"],
            "first_name": st["first_name"],
            "last_name": st["last_name"],
            "password": hashed_pw,
            "category": "student_member",
            "sub_role": "student_member",
            "account_state": "active",
            "is_active": True,
            "must_change_password": False,
            "club_id": club.code if club else "",
            "institution_id": inst.code if inst else "",
            "state_id": st_state.code if st_state else "",
            "zone_id": st_zone.code if st_zone else "",
        }

        user, _ = User.objects.update_or_create(
            username=st["username"],
            defaults=user_defaults,
        )
        user.password = hashed_pw
        user.is_active = True
        user.account_state = "active"
        user.must_change_password = False
        user.save()

        # Ensure active student profile if club exists
        if club:
            profile, _ = StudentMemberProfile.objects.update_or_create(
                user=user,
                defaults={
                    "club": club,
                    "gender": st["gender"],
                    "department": st["department"],
                    "roll_number": st["roll_number"],
                    "validity_years": 1,
                    "valid_until": expiry,
                    "points": st["points"],
                    "badge": st["badge"],
                    "is_suspended_by_coordinator": False,
                },
            )

            if st["attach_subclub"] and hasattr(profile, "sub_clubs"):
                profile.sub_clubs.add(st["attach_subclub"])

            Membership.objects.update_or_create(
                user=user,
                club=club,
                defaults={
                    "status": "active",
                },
            )

            JoinRequest.objects.update_or_create(
                user=user,
                club=club,
                defaults={
                    "source": "passkey",
                    "status": "approved",
                },
            )

    # 3. Ensure test authority accounts (bhu.president and pres.bhu-008)
    AuthorityAssignment = apps.get_model("domain", "AuthorityAssignment")
    for pres_uname, pres_email in [
        ("bhu.president", "pres.bhu@bhu.ac.in"),
        ("pres.bhu-008", "pres.club-bhu-008@ndli.edu"),
    ]:
        pres_defaults = {
            "email": pres_email,
            "first_name": "Dr. D. K.",
            "last_name": "Rai",
            "password": hashed_pw,
            "category": "club_admin",
            "sub_role": "club_president",
            "account_state": "active",
            "is_active": True,
            "must_change_password": False,
            "club_id": bhu_club.code if bhu_club else "",
            "institution_id": (
                bhu_club.institution.code
                if (bhu_club and bhu_club.institution)
                else ""
            ),
            "state_id": (
                bhu_club.institution.state.code
                if (bhu_club and bhu_club.institution and bhu_club.institution.state)
                else ""
            ),
            "zone_id": (
                bhu_club.institution.state.zone.code
                if (
                    bhu_club
                    and bhu_club.institution
                    and bhu_club.institution.state
                    and bhu_club.institution.state.zone
                )
                else ""
            ),
        }
        pres_user, _ = User.objects.update_or_create(
            username=pres_uname,
            defaults=pres_defaults,
        )
        pres_user.password = hashed_pw
        pres_user.is_active = True
        pres_user.account_state = "active"
        pres_user.must_change_password = False
        pres_user.save()

        if bhu_club:
            AuthorityAssignment.objects.update_or_create(
                user=pres_user,
                club=bhu_club,
                tier="President",
                defaults={
                    "from_date": date.today(),
                    "status": "active",
                },
            )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0003_schoolstudentroster_studentmemberprofile"),
        ("domain", "0010_zero_canonical_club_activity_counts"),
        ("accounts", "0004_rename_user_table"),
    ]

    operations = [
        migrations.RunPython(seed_test_students_and_subclubs, noop),
    ]
