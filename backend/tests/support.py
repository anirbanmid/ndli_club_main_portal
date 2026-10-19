"""Shared builders for the M1 adversarial pins.

Everything here is offline and deterministic: no network, no real mail
server (the locmem email backend captures messages in memory).
"""
from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import RequestFactory, TestCase

from apps.accounts.models import AccountState, Category, SubRole


class M1PinTestCase(TestCase):
    """``TestCase`` with a clean rate-limit window for every test.

    The sliding-window throttle lives in Django's cache. The locmem backend
    persists across tests in one process, so without this the rate-limit
    pins leak into each other and fail at random.
    """

    def setUp(self) -> None:
        cache.clear()
        super().setUp()

    def tearDown(self) -> None:
        cache.clear()
        super().tearDown()

#: A password that satisfies the M1 policy (>= 10 chars, not in the denylist).
GOOD_PASSWORD = "zS8#kQ2mRw7p"
OTHER_PASSWORD = "vN4!tL9xBd6c"

# --- Route / module matrix -------------------------------------------------

#: The three module namespaces of PLAN_ACCESS_ARCHITECTURE.md §1 and the
#: categories allowed into each. Module 3 (IIT Kgp Admin) is the only one
#: with cross-niche super powers.
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

#: Every sub-role, grouped by the category that owns it (PLAN §3).
CATEGORY_SUB_ROLES: dict[str, frozenset[str]] = {
    Category.GENERAL_PUBLIC: frozenset({SubRole.ANONYMOUS}),
    Category.CLUB_ADMIN: frozenset(
        {
            SubRole.CLUB_EXECUTIVE,
            SubRole.CLUB_SECRETARY,
            SubRole.CLUB_PRESIDENT,
            SubRole.CLUB_PATRON,
        }
    ),
    Category.STUDENT_MEMBER: frozenset({SubRole.STUDENT_MEMBER}),
    Category.IIT_KGP_ADMIN: frozenset(
        {
            SubRole.CENTRAL_ADMIN,
            SubRole.REGIONAL_OFFICER,
            SubRole.SUPER_ADMIN_OPS,
        }
    ),
}


def make_user(
    *,
    username: str,
    category: str,
    sub_role: str,
    password: str = GOOD_PASSWORD,
    email: str = "",
    institution_code: str = "",
    club_code: str = "",
    zone_code: str = "",
    state_code: str = "",
    account_state: str = AccountState.ACTIVE,
    must_change_password: bool = False,
    phone: str = "",
    alt_phone: str = "",
) -> Any:
    """Create ONE identity record (M2U: the user IS the profile) and return it."""
    user_model = get_user_model()
    return user_model.objects.create_user(
        username=username,
        email=email or f"{username}@example.test",
        password=password,
        category=category,
        sub_role=sub_role,
        institution_code=institution_code,
        club_code=club_code,
        zone_code=zone_code,
        state_code=state_code,
        account_state=account_state,
        must_change_password=must_change_password,
        phone=phone,
        alt_phone=alt_phone,
    )


def request_for(user: Any = None, *, ip: str = "203.0.113.10") -> Any:
    """A request object carrying META/user, as the services expect."""
    request: Any = RequestFactory().post("/api/v1/test/", REMOTE_ADDR=ip)
    request.user = user if user is not None else _Anonymous()
    return request


class _Anonymous:
    """Minimal stand-in for an unauthenticated caller."""

    is_authenticated = False
    is_anonymous = True
    pk = None

    def get_username(self) -> str:  # pragma: no cover - repr helper
        return ""


def iter_routes(urlpatterns: Any = None, prefix: str = ""):
    """Yield ``(name, path)`` for every param-free route in the URLconf.

    Django's route patterns carry no leading slash (``str(RoutePattern)``
    gives ``"health/"``), so paths are normalised to start with ``/``.
    Parameterised patterns (``<int:pk>``) are skipped because no concrete
    URL can be built for them; anything else is swept. A new endpoint is
    therefore picked up automatically — the pins cannot silently miss it.
    """
    from django.urls import get_resolver

    if urlpatterns is None:
        urlpatterns = get_resolver().url_patterns
    for pattern in urlpatterns:
        route = str(pattern.pattern)
        if hasattr(pattern, "url_patterns"):
            yield from iter_routes(pattern.url_patterns, prefix + route)
            continue
        if "<" in route:
            continue
        path = prefix + route
        if not path.startswith("/"):
            path = "/" + path
        yield (pattern.name or ""), path
