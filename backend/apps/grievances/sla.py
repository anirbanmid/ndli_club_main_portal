"""The business-hours SLA clock (BRIEF_M6 §6 C3: Mon-Fri 09:00-18:00).

Deadlines in the ticket lifecycle are wall-clock (exactly the previous
project's 72h / 7d / 30d — C3 "overdue/escalation rules = the previous
project's issue lifecycle"); the office-hours window decides WHEN sweeps may
dispatch reminders/escalations and how compliance windows are measured.

Everything is driven by ``settings.GRIEVANCE_SLA`` — the one settings-backed
store (P4). Nothing here writes to the database.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.conf import settings


def _config() -> dict[str, Any]:
    return settings.GRIEVANCE_SLA


def tz() -> ZoneInfo:
    """The SLA time zone (Asia/Kolkata unless the settings store says else)."""
    return ZoneInfo(_config().get("TIME_ZONE", "Asia/Kolkata"))


def now() -> datetime:
    """Aware `now` in the SLA time zone."""
    return datetime.now(tz())


def _window() -> tuple[tuple[int, ...], time, time]:
    cfg = _config()
    weekdays = tuple(cfg.get("OFFICE_WEEKDAYS", (0, 1, 2, 3, 4)))
    start_h, start_m = (
        int(x) for x in str(cfg.get("OFFICE_START", "09:00")).split(":")
    )
    end_h, end_m = (int(x) for x in str(cfg.get("OFFICE_END", "18:00")).split(":"))
    return weekdays, time(start_h, start_m), time(end_h, end_m)


def is_office_hours(moment: datetime) -> bool:
    """True while the SLA clock ticks (Mon-Fri 09:00-18:00 by default)."""
    weekdays, start, end = _window()
    local = moment.astimezone(tz())
    return local.weekday() in weekdays and start <= local.time() < end


def next_office_moment(moment: datetime) -> datetime:
    """The first office-hours instant at or after ``moment`` (dispatch gate)."""
    weekdays, start, end = _window()
    local = moment.astimezone(tz())
    if local.weekday() in weekdays and local.time() < start:
        return local.replace(
            hour=start.hour, minute=start.minute, second=0, microsecond=0
        )
    candidate = local.replace(
        hour=start.hour, minute=start.minute, second=0, microsecond=0
    )
    while True:
        candidate = candidate + timedelta(days=1)
        if candidate.weekday() in weekdays:
            return candidate


def add_office_hours(moment: datetime, hours: float) -> datetime:
    """Advance ``moment`` by ``hours`` SLA-clock hours (office window only).

    Exposed for business-hours compliance windows; the lifecycle deadlines
    themselves are wall-clock (see the module docstring).
    """
    weekdays, start, end = _window()
    remaining = timedelta(hours=hours)
    cursor = moment.astimezone(tz())
    if not is_office_hours(cursor):
        cursor = next_office_moment(cursor)
    while remaining > timedelta(0):
        day_end = cursor.replace(
            hour=end.hour, minute=end.minute, second=0, microsecond=0
        )
        if cursor >= day_end:
            cursor = next_office_moment(cursor + timedelta(days=1))
            continue
        available = day_end - cursor
        if available >= remaining:
            return cursor + remaining
        remaining -= available
        cursor = next_office_moment(day_end)
    return cursor
