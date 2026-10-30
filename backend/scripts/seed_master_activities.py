import os
import sys
import csv
import uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
import django
django.setup()

from apps.activities.models import ActivityLog, SupportType
from django.contrib.auth import get_user_model

User = get_user_model()

TYPE_MAPPING = {
    "Club Approval": SupportType.CLUB_APPROVAL,
    "Phone call and remote assistance": SupportType.PHONE_CALL,
    "Registration Renewal": SupportType.REGISTRATION_RENEWAL,
    "Closing of OS Ticket": SupportType.OS_TICKET,
    "Online training": SupportType.ONLINE_TRAINING,
    "Offline training": SupportType.OFFLINE_TRAINING,
    "Data Correction": SupportType.OS_TICKET,
    "Data Migration": SupportType.OS_TICKET,
}

csv_path = r"D:\GitHub\ndli-club-management\data\master\master_activities.csv"
if not os.path.exists(csv_path):
    print("CSV not found at", csv_path)
    sys.exit(1)

with open(csv_path, "r", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

print(f"Found {len(rows)} rows in master_activities.csv")

created_count = 0
for r in rows:
    emp_id = r["emp_id"].strip().upper()
    try:
        user = User.objects.get(username=emp_id)
    except User.DoesNotExist:
        # Check if user exists with lower case or create
        try:
            user = User.objects.get(username=emp_id.lower())
        except User.DoesNotExist:
            print(f"User {emp_id} does not exist, skipping")
            continue

    raw_type = r["support_type"].strip()
    stype = TYPE_MAPPING.get(raw_type, SupportType.PHONE_CALL)
    priority = bool(int(r.get("priority_flag", 0))) or (stype in [SupportType.CLUB_APPROVAL, SupportType.REGISTRATION_RENEWAL])
    
    # Parse timestamp
    ts_str = r.get("timestamp", "").strip()
    try:
        if "T" in ts_str:
            ts = datetime.fromisoformat(ts_str)
        else:
            ts = datetime.strptime(ts_str, "%Y-%m-%d")
    except Exception:
        ts = datetime.now()

    # Deterministic UUID based on activity_id
    raw_act_id = r.get("activity_id", "").strip()
    if raw_act_id:
        act_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, raw_act_id)
    else:
        act_uuid = uuid.uuid4()

    club_id = r.get("club_id", "").strip()
    notes = r.get("notes", "").strip()

    act, created = ActivityLog.objects.get_or_create(
        activity_id=act_uuid,
        defaults={
            "employee": user,
            "support_type": stype,
            "priority_flag": priority,
            "club_code": club_id,
            "notes": notes,
            "call_count": 1,
        }
    )
    if created:
        # update timestamp because auto_now_add overrides initial save
        ActivityLog.objects.filter(pk=act.pk).update(timestamp=ts)
        created_count += 1

print(f"Seeded {created_count} new ActivityLog rows. Total in DB: {ActivityLog.objects.count()}")
