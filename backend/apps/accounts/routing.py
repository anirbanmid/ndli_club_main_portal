"""Approval routing hook (BRIEF_M1.md F2, BRIEF_M2.md §2b).

The registration request lands on "the employee responsible for that
State/UT". From M2 on this hook reads the ``OfficerAssignment`` table
ONLY (P4 single source) via ``domain.assignments`` — the data is seeded
from ``data/samples/`` and admin-editable, never hard-coded. States with
no open assignment resolve to ``None`` ("awaiting officer assignment" —
``manage.py verify_domain`` reports them; registrations are never blocked).
"""

from __future__ import annotations


def responsible_officer(state_code: str) -> str | None:
    """Return the username of the officer responsible for ``state_code``.

    Backed by the seeded ``OfficerAssignment`` rows; cached with explicit
    invalidation (``domain.assignments``). Never guesses a fallback officer.
    """
    from apps.domain import assignments

    return assignments.officer_username_for_state(state_code)
