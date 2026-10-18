"""Approval routing hook (BRIEF_M1.md F2).

The registration request lands on "the employee responsible for that
State/UT". The zone/officer assignment table is DATA (M2 seeds it from
``data/samples``); M1 ships this hook plus the enforced scope rule
(a Regional Officer may act only inside their own zone — see
``accounts.services.approve_club_account``).
"""
from __future__ import annotations


def responsible_officer(state_code: str) -> str | None:
    """Return the username of the officer responsible for ``state_code``.

    Returns ``None`` until M2 seeds the State/UT → officer assignment table;
    callers must route via the club account's scope (zone) in the meantime.
    """
    return None  # M2: look up the seeded assignment table here.
