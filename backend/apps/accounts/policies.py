"""THE central policy layer (PLAN_ACCESS_ARCHITECTURE.md §5, BRIEF §4).

Everything authorization-related lives in this one module:

* ``CategoryGate(module, sub_roles)`` — route gating per module namespace
  (``public`` / ``club`` / ``admin``) and per sub-role inside the module.
* ``ObjectScope("clubs"|"members"|"governance")`` — object-level gate that
  turns out-of-scope IDs into 404 (never data).
* ``DenyAll`` — the DRF default; endpoints without explicit policy deny.

Views MUST NOT scatter ``if request.user...`` authorization logic
(``tests/test_m1_t3_matrix.py`` greps for that and fails the build).
"""
from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from rest_framework.exceptions import NotFound
from rest_framework.permissions import BasePermission

from apps.core import scoping as core_scoping

from .models import (
    CLUB_AUTHORITY_SUB_ROLES,
    IIT_KGP_ADMIN_SUB_ROLES,
    AccountState,
    Category,
    SubRole,
    User,
)

#: Which categories may enter which module namespace (PLAN §5.1).
MODULE_CATEGORIES: dict[str, frozenset[str]] = {
    "public": frozenset(
        {
            Category.GENERAL_PUBLIC,
            Category.CLUB_ADMIN,
            Category.STUDENT_MEMBER,
            Category.IIT_KGP_ADMIN,
        }
    ),
    "club": frozenset({Category.CLUB_ADMIN, Category.STUDENT_MEMBER}),
    "admin": frozenset({Category.IIT_KGP_ADMIN}),
}

#: The three scope helpers of ``core.scoping`` by name.
SCOPE_FUNCTIONS = {
    "clubs": core_scoping.scope_clubs,
    "members": core_scoping.scope_members,
    "governance": core_scoping.scope_governance,
}


class DenyAll(BasePermission):
    """Fail-closed default: no endpoint without an explicit policy."""

    def has_permission(self, request: Any, view: Any) -> bool:
        return False


class CategoryGate(BasePermission):
    """Module + sub-role gate (instantiated per view: ``CategoryGate(...)``).

    ``require_fresh_password=False`` allows a session whose account is under
    ``must_change_password`` (the F5 temporary password / F2 welcome-link
    state) to reach exactly one place: the change-password endpoint.
    """

    def __init__(
        self,
        module: str,
        sub_roles: Iterable[str] | None = None,
        *,
        require_fresh_password: bool = True,
        require_mfa: bool | None = None,
    ) -> None:
        if module not in MODULE_CATEGORIES:
            raise ValueError(f"unknown module namespace: {module!r}")
        self.module = module
        self.sub_roles = frozenset(sub_roles) if sub_roles is not None else None
        self.require_fresh_password = require_fresh_password
        self.require_mfa = require_mfa if require_mfa is not None else module == "admin"

    def __call__(self) -> CategoryGate:
        # DRF instantiates permission classes; shared stateless instance is fine.
        return self

    def has_permission(self, request: Any, view: Any) -> bool:
        # Module 1 (public namespace) is open to everyone, including
        # authenticated callers of every category.
        if self.module == "public" and self.sub_roles is None:
            return True

        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return False
        # M2U: the user IS the identity record — anything that is not an
        # accounts.User (e.g. AnonymousUser) is denied, exactly like the old
        # "authenticated but profile-less" case.
        if not isinstance(user, User):
            return False
        profile = user
        if profile.category not in MODULE_CATEGORIES[self.module]:
            return False
        if self.sub_roles is not None and profile.sub_role not in self.sub_roles:
            return False
        if profile.account_state != AccountState.ACTIVE:
            return False
        if self.require_fresh_password and profile.must_change_password:
            return False
        if self.require_mfa and not getattr(request, "session", {}).get("mfa_verified"):
            return False
        return True


class ObjectScope(BasePermission):
    """Object-level scoping: out-of-scope IDs raise 404, never data."""

    def __init__(self, scope: str) -> None:
        if scope not in SCOPE_FUNCTIONS:
            raise ValueError(f"unknown scope: {scope!r}")
        self.scope = scope

    def __call__(self) -> ObjectScope:
        return self

    def has_object_permission(self, request: Any, view: Any, obj: Any) -> bool:
        scope_fn = SCOPE_FUNCTIONS[self.scope]
        model = type(obj)
        visible = scope_fn(model._default_manager.filter(pk=obj.pk), request.user)
        if not visible.exists():
            # Out-of-scope IDs are indistinguishable from missing ones.
            raise NotFound("Not found.")
        return True


# Convenience gate constructors used by the views (kept here so ALL policy
# knowledge stays in this module).
CLUB_AUTHORITY_GATE = CategoryGate("club", CLUB_AUTHORITY_SUB_ROLES)
STUDENT_GATE = CategoryGate("club", {SubRole.STUDENT_MEMBER})
ADMIN_OFFICER_GATE = CategoryGate(
    "admin", {SubRole.CENTRAL_ADMIN, SubRole.REGIONAL_OFFICER}
)
ADMIN_STAFF_GATE = CategoryGate("admin", IIT_KGP_ADMIN_SUB_ROLES)


# M4 D4: the whole club module (authorities + students) for roster READS.
# Per-user row visibility is decided mechanically by core.scoping (a student
# gets their own rows only) — never by hand-rolled view logic (I5).
CLUB_MODULE_GATE = CategoryGate("club")
