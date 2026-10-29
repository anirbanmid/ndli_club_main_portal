"""Domain app configuration (milestone M2).

The domain app owns the REAL scoping structure of the portal: Zones,
States/UTs, Districts, Institutions, Clubs and the relational links
(Membership, AuthorityAssignment, OfficerAssignment). Everything here is
data-driven (seed files under ``data/samples/`` + admin-editable); no zone,
state or officer mapping is hard-coded anywhere in Python.
"""

from __future__ import annotations

from django.apps import AppConfig


class DomainConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.domain"
    label = "domain"
    verbose_name = "Club domain"

    def ready(self) -> None:
        # Wire the OfficerAssignment cache-invalidation signals (P4: explicit
        # invalidation for the one cached derived value in M2).
        from . import signals  # noqa: F401
