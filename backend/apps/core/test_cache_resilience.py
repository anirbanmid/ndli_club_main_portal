"""A Redis outage must degrade, never return HTTP 500.

Regression pins for the 2026-11-06 production outage: ``REDIS_URL`` pointed at
an unreachable endpoint, and because stock ``RedisCache`` raises out of every
call, login and all three public APIs returned HTTP 500 while
``/health/ready/`` reported ``database: true, cache: false``.

The contract pinned here: with Redis unreachable, storage calls succeed
against the process-local fallback, rate limiting keeps counting, and neither
the login view nor the public telemetry endpoint can 500.
"""

from __future__ import annotations

from django.test import TestCase, override_settings

from apps.accounts.throttles import sliding_window_allow
from apps.core.cache import ResilientRedisCache

#: Port 1 is unassigned, so this URL is refused immediately by the kernel.
BROKEN_REDIS = "redis://127.0.0.1:1/0"

#: Bound the refused connection so the suite never waits on TCP retries.
BROKEN_PARAMS: dict[str, dict[str, object]] = {
    "OPTIONS": {"socket_connect_timeout": 0.5, "socket_timeout": 0.5},
}

BROKEN_CACHES: dict[str, dict[str, object]] = {
    "default": {
        "BACKEND": "apps.core.cache.ResilientRedisCache",
        "LOCATION": BROKEN_REDIS,
        **BROKEN_PARAMS,
    }
}


class ResilientCacheTests(TestCase):
    """Storage degrades instead of raising while Redis is unreachable."""

    def test_store_survives_an_unreachable_redis(self) -> None:
        store = ResilientRedisCache(BROKEN_REDIS, dict(BROKEN_PARAMS))
        store.set("resilience:k", "v", 30)
        self.assertEqual(store.get("resilience:k"), "v")
        self.assertTrue(store.has_key("resilience:k"))
        store.delete("resilience:k")
        self.assertIsNone(store.get("resilience:k"))

    def test_read_write_and_delete_all_degrade(self) -> None:
        store = ResilientRedisCache(BROKEN_REDIS, dict(BROKEN_PARAMS))
        self.assertEqual(store.set_many({"a": 1, "b": 2}), [])
        self.assertEqual(store.get_many(["a", "b"]), {"a": 1, "b": 2})
        self.assertTrue(store.touch("a", 30))
        self.assertFalse(store._primary_usable())
        # incr on a fresh key differs by backend (Redis seeds it, locmem does
        # not), so seed it first: the pin is that incr does not raise.
        store.set("counter", 0, 30)
        self.assertEqual(store.incr("counter"), 1)
        store.delete_many(["a", "b", "counter"])
        store.clear()
        self.assertIsNone(store.get("a"))

    def test_first_failure_opens_a_bounded_cooldown(self) -> None:
        store = ResilientRedisCache(BROKEN_REDIS, dict(BROKEN_PARAMS))
        self.assertTrue(store._primary_usable())
        store.get("resilience:cooldown")
        self.assertFalse(store._primary_usable())


class CacheOutageEndpointTests(TestCase):
    """The endpoints that were serving 500s must serve real responses."""

    def test_throttle_keeps_counting_during_the_outage(self) -> None:
        key = "outage:203.0.113.7"
        with override_settings(CACHES=BROKEN_CACHES):
            self.assertTrue(sliding_window_allow(key, 3, 60))
            self.assertTrue(sliding_window_allow(key, 3, 60))
            self.assertTrue(sliding_window_allow(key, 3, 60))
            self.assertFalse(sliding_window_allow(key, 3, 60))

    def test_login_never_500s_when_the_cache_is_down(self) -> None:
        with override_settings(CACHES=BROKEN_CACHES):
            response = self.client.post(
                "/api/v1/accounts/login/",
                data={
                    "username": "nobody",
                    "password": "not-a-real-password",
                    "captcha": "wrong",
                },
                content_type="application/json",
            )
        self.assertNotEqual(response.status_code, 500)

    def test_public_telemetry_never_500s_when_the_cache_is_down(self) -> None:
        with override_settings(CACHES=BROKEN_CACHES):
            response = self.client.get("/api/v1/public/telemetry/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("states", response.json())

    def test_public_directory_never_500s_when_the_cache_is_down(self) -> None:
        with override_settings(CACHES=BROKEN_CACHES):
            response = self.client.get("/api/v1/public/directory/?q=iit")
        self.assertEqual(response.status_code, 200)
