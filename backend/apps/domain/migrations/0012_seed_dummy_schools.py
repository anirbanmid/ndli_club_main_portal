# Generated for dummy SCHOOL test data via live charter-flow SSOT pattern.
# Runs automatically on `python manage.py migrate` — no shell access required.
# Dummy test data — clean before client handover.

from __future__ import annotations

from datetime import date

from django.contrib.auth.hashers import make_password
from django.db import migrations

from apps.domain.integrity import LedgerIntegrityEngine


def _get_officer(User, state_code: str):
    """Resolve the zone officer for a state."""
    OFFICER_STATE_MAP = {
        "DELHI": "EMP01",
        "UTTAR_PRADESH": "EMP01",
        "MADHYA_PRADESH": "EMP02",
        "MAHARASHTRA": "EMP03",
        "WEST_BENGAL": "EMP04",
        "KARNATAKA": "EMP06",
        "TAMIL_NADU": "EMP07",
    }
    username = OFFICER_STATE_MAP.get(state_code)
    if not username:
        return None
    return User.objects.filter(username=username, is_active=True).first()


SCHOOLS = [
    {
        "inst_code": "INST-SPS-DEL-001",
        "legacy_id": "LEG-INST-SPS-DEL-001",
        "inst_name": "Springdale Public School",
        "club_code": "CLUB-SPS-DEL-001",
        "club_name": "Springdale NDLI Club",
        "state_code": "DELHI",
        "district_code": "DELHI-SOUTH",
        "aishe_code": None,
        "reg_no": "NDLI/CLUB/SPS-DEL-001",
        "doa": date(2026, 11, 4),
        "president_email": "president.springdale@school.test",
        "president_name": "President Springdale",
        "patron_name": "Patron Springdale",
        "secretary_name": "Secretary Springdale",
    },
    {
        "inst_code": "INST-SVM-WB-001",
        "legacy_id": "LEG-INST-SVM-WB-001",
        "inst_name": "Shree Vidya Mandir",
        "club_code": "CLUB-SVM-WB-001",
        "club_name": "Shree Vidya Mandir NDLI Club",
        "state_code": "WEST_BENGAL",
        "district_code": "KOLKATA",
        "aishe_code": None,
        "reg_no": "NDLI/CLUB/SVM-WB-001",
        "doa": date(2026, 11, 4),
        "president_email": "president.shreevidya@school.test",
        "president_name": "President Shree Vidya Mandir",
        "patron_name": "Patron Shree Vidya Mandir",
        "secretary_name": "Secretary Shree Vidya Mandir",
    },
    {
        "inst_code": "INST-SES-MH-001",
        "legacy_id": "LEG-INST-SES-MH-001",
        "inst_name": "Sunrise English School",
        "club_code": "CLUB-SES-MH-001",
        "club_name": "Sunrise NDLI Club",
        "state_code": "MAHARASHTRA",
        "district_code": "PUNE",
        "aishe_code": None,
        "reg_no": "NDLI/CLUB/SES-MH-001",
        "doa": date(2026, 11, 4),
        "president_email": "president.sunrise@school.test",
        "president_name": "President Sunrise English",
        "patron_name": "Patron Sunrise English",
        "secretary_name": "Secretary Sunrise English",
    },
    {
        "inst_code": "INST-GVH-KA-001",
        "legacy_id": "LEG-INST-GVH-KA-001",
        "inst_name": "Green Valley High School",
        "club_code": "CLUB-GVH-KA-001",
        "club_name": "Green Valley NDLI Club",
        "state_code": "KARNATAKA",
        "district_code": "BENGALURU-URBAN",
        "aishe_code": None,
        "reg_no": "NDLI/CLUB/GVH-KA-001",
        "doa": date(2026, 11, 4),
        "president_email": "president.greenvalley@school.test",
        "president_name": "President Green Valley",
        "patron_name": "Patron Green Valley",
        "secretary_name": "Secretary Green Valley",
    },
    {
        "inst_code": "INST-BVB-TN-001",
        "legacy_id": "LEG-INST-BVB-TN-001",
        "inst_name": "Bharatiya Vidya Bhavan School",
        "club_code": "CLUB-BVB-TN-001",
        "club_name": "BVB NDLI Club",
        "state_code": "TAMIL_NADU",
        "district_code": "CHENNAI",
        "aishe_code": None,
        "reg_no": "NDLI/CLUB/BVB-TN-001",
        "doa": date(2026, 11, 4),
        "president_email": "president.bvb@school.test",
        "president_name": "President BVB",
        "patron_name": "Patron BVB",
        "secretary_name": "Secretary BVB",
    },
]

DEMO_PASSWORD = "Dummy123456"


def seed_dummy_schools(apps, schema_editor):
    Institution = apps.get_model("domain", "Institution")
    Club = apps.get_model("domain", "Club")
    State = apps.get_model("domain", "State")
    District = apps.get_model("domain", "District")
    User = apps.get_model("accounts", "User")
    AuthorityAssignment = apps.get_model("domain", "AuthorityAssignment")

    from apps.accounts.models import AccountState, Category, SubRole

    created = []

    for item in SCHOOLS:
        state = State.objects.filter(code=item["state_code"]).first()
        if not state:
            continue

        district = None
        if item.get("district_code"):
            district = District.objects.filter(
                code=item["district_code"], state=state
            ).first()

        # 1. Institution (institution_type="school")
        inst, _ = Institution.objects.update_or_create(
            code=item["inst_code"],
            defaults={
                "legacy_id": item["legacy_id"],
                "name": item["inst_name"],
                "institution_type": "school",
                "aishe_code": item["aishe_code"],
                "state": state,
                "district": district,
                "status": "active",
            },
        )

        # 2. Club
        club, _ = Club.objects.update_or_create(
            code=item["club_code"],
            defaults={
                "institution": inst,
                "name": item["club_name"],
                "registration_no": item["reg_no"],
                "status": "active",
                "date_of_approval": item["doa"],
                "last_renewal_date": item["doa"],
                "upcoming_renewal_date": date(
                    item["doa"].year + 1, item["doa"].month, item["doa"].day
                ),
                "member_count": 0,
                "patron_name": item["patron_name"],
                "patron_email": item["president_email"],
                "president_name": item["president_name"],
                "president_email": item["president_email"],
                "secretary_name": item["secretary_name"],
                "secretary_email": item["president_email"],
                "is_sample": False,
            },
        )

        # 3. Authority User (President) with usable password
        clean_code = item["club_code"].lower().replace("club-", "").replace("-", "")
        pres_username = f"pres.{clean_code}"
        pres_user, pres_created = User.objects.get_or_create(
            username=pres_username,
            defaults={
                "email": item["president_email"],
                "category": Category.CLUB_ADMIN,
                "sub_role": SubRole.CLUB_PRESIDENT,
                "account_state": AccountState.ACTIVE,
                "first_name": item["president_name"],
                "is_active": True,
                "club": club,
                "institution": inst,
                "state": state,
                "zone": state.zone,
                "password": make_password(DEMO_PASSWORD),
            },
        )
        if not pres_created:
            pres_user.password = make_password(DEMO_PASSWORD)
            pres_user.save(update_fields=["password"])

        # 4. AuthorityAssignment
        AuthorityAssignment.objects.update_or_create(
            user=pres_user,
            club=club,
            tier="President",
            defaults={
                "from_date": item["doa"],
                "status": "active",
            },
        )

        # 5. ActivityLog via LedgerIntegrityEngine (SSOT gate + KPI source)
        officer = _get_officer(User, item["state_code"])
        if officer:
            LedgerIntegrityEngine.ensure_club_approval_log(
                club,
                officer=officer,
                timestamp=item["doa"],
                strict_gate=False,
            )

        created.append(
            {
                "name": item["inst_name"],
                "state": item["state_code"],
                "inst_code": inst.code,
                "club_code": club.code,
                "president_email": item["president_email"],
            }
        )

    return created


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("domain", "0011_purge_legacy_sample_data"),
    ]

    operations = [
        migrations.RunPython(seed_dummy_schools, noop),
    ]
