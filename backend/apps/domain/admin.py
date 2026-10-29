"""Django admin registration for the domain tables (admin-editable data).

The domain is DATA (BRIEF_M2.md §1): zones, states, districts, institutions,
clubs and the two assignment tables are maintained here and through the seed
loader — never hard-coded. The admin surface is staff-only (Module 3 gate),
list views pre-fetch their relations (no N+1) and the immutable
``Institution.legacy_id`` is read-only (it is an anchor, not an input).
"""

from __future__ import annotations

from typing import Any

from django.contrib import admin

from .models import (
    AuthorityAssignment,
    Club,
    District,
    Institution,
    Membership,
    OfficerAssignment,
    State,
    Zone,
)


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active")
    search_fields = ("code", "name")
    ordering = ("code",)


@admin.register(State)
class StateAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "zone", "kind")
    list_select_related = ("zone",)
    list_filter = ("zone", "kind")
    search_fields = ("code", "name")
    ordering = ("code",)


@admin.register(District)
class DistrictAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "state")
    list_select_related = ("state",)
    list_filter = ("state",)
    search_fields = ("code", "name")
    ordering = ("state", "code")


@admin.register(Institution)
class InstitutionAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "state", "district", "aishe_code", "status")
    list_select_related = ("state", "district")
    list_filter = ("status", "state")
    search_fields = ("code", "name", "legacy_id", "aishe_code")
    ordering = ("name",)

    def get_readonly_fields(self, request: Any, obj: Any = None) -> tuple[str, ...]:
        # legacy_id is the immutable anchor; aishe linking is an audited
        # service action, not a free-form admin edit.
        base = ("legacy_id",)
        if obj is not None and obj.aishe_code:
            return base + ("aishe_code",)
        return base


@admin.register(Club)
class ClubAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "institution", "status")
    list_select_related = ("institution",)
    list_filter = ("status",)
    search_fields = ("code", "name")
    ordering = ("code",)


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "club", "role", "joined_on", "status")
    list_select_related = ("user", "club")
    list_filter = ("status", "role")
    search_fields = ("user__username", "club__code")
    ordering = ("club", "joined_on")


@admin.register(AuthorityAssignment)
class AuthorityAssignmentAdmin(admin.ModelAdmin):
    list_display = ("user", "club", "tier", "from_date", "to_date", "status")
    list_select_related = ("user", "club")
    list_filter = ("tier", "status")
    search_fields = ("user__username", "club__code")
    ordering = ("club", "tier", "-from_date")


@admin.register(OfficerAssignment)
class OfficerAssignmentAdmin(admin.ModelAdmin):
    list_display = ("state", "officer", "from_date", "to_date")
    list_select_related = ("state", "officer")
    search_fields = ("state__code", "officer__username")
    ordering = ("state", "-from_date")
