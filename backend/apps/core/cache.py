"""Cache backends that cannot take the portal offline.

Production keeps its cache in a managed Redis. When Redis is unreachable —
wrong URL scheme, rotated credentials, a service restart — a plain
``RedisCache`` raises out of the very first ``cache.get()`` of a request. Our
throttles and public aggregates call the cache unguarded and call it FIRST, so
one outage turned every public endpoint and the login view into an HTTP 500:
``/health/ready/`` reported ``database: true, cache: false`` while
``/api/v1/accounts/login/``, ``/api/v1/public/telemetry/``,
``/api/v1/public/directory/`` and ``/api/v1/public/verify/`` all served 500s.

A cache holds an optimisation and a rate-limit counter; neither is worth
taking a national portal down for. :class:`ResilientRedisCache` keeps Redis as
the primary store — so counters stay shared across gunicorn workers — and
degrades to a process-local store for a bounded window before retrying, so a
recovered Redis is picked up without a restart.

The degradation is deliberate but never silent:

* every failure is logged at ``ERROR`` with its traceback, and
* ``/health/ready/`` keeps reporting ``cache: false`` while Redis is down, so
  probes still see the outage instead of the fallback hiding it.

While degraded the cross-worker guarantees do not hold: rate-limit windows are
per worker and cached tokens may not cross workers. Login stays protected by
its CAPTCHA gate, which never touches the cache.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from django.core.cache.backends.base import DEFAULT_TIMEOUT
from django.core.cache.backends.locmem import LocMemCache
from django.core.cache.backends.redis import RedisCache

logger = logging.getLogger(__name__)

#: Seconds to skip Redis after a failure before trying it again. Bounded so a
#: recovered Redis is picked up without a process restart, and short enough
#: that a blip does not pin the portal to process-local counters.
RETRY_COOLDOWN_SECONDS = 30.0


class ResilientRedisCache(RedisCache):
    """``RedisCache`` that falls back to process-local memory while Redis is down.

    Only the storage call is guarded: keys, versions and serialisation are
    still resolved by the real backends, so a value written through the
    fallback is read back through the same backend that wrote it.
    """

    def __init__(self, server: Any, params: dict[str, Any]) -> None:
        # Copied before super() so the fallback carries the same KEY_PREFIX and
        # VERSION and therefore addresses byte-identical keys as the primary.
        fallback_params = dict(params)
        super().__init__(server, self._bounded(params))
        self._fallback = LocMemCache(str(server), fallback_params)
        self._retry_after = 0.0

    @staticmethod
    def _bounded(params: dict[str, Any]) -> dict[str, Any]:
        """Cap connect/read time so a hanging endpoint cannot stall a worker.

        A TLS-only endpoint reached over plaintext accepts the TCP connection
        and then never speaks RESP, so the OS TCP timeout (minutes) would apply.
        Without this bound gunicorn would kill the worker before the fallback
        ever engaged — the outage would merely change shape, not disappear.
        """
        options = dict(params.get("OPTIONS", {}))
        options.setdefault("socket_connect_timeout", 2)
        options.setdefault("socket_timeout", 5)
        return {**params, "OPTIONS": options}

    def _primary_usable(self) -> bool:
        return time.monotonic() >= self._retry_after

    def _run(self, name: str, *args: Any, **kwargs: Any) -> Any:
        """Call Redis, or the fallback while Redis sits inside its cooldown."""
        if self._primary_usable():
            try:
                result = getattr(super(), name)(*args, **kwargs)
            except Exception:  # noqa: BLE001 - any store failure must degrade
                self._retry_after = time.monotonic() + RETRY_COOLDOWN_SECONDS
                logger.error(
                    "cache.%s() failed; using the process-local fallback for "
                    "%ss (cross-worker sharing suspended)",
                    name,
                    RETRY_COOLDOWN_SECONDS,
                    exc_info=True,
                )
            else:
                self._retry_after = 0.0
                return result
        return getattr(self._fallback, name)(*args, **kwargs)

    def add(
        self,
        key: str,
        value: Any,
        timeout: Any = DEFAULT_TIMEOUT,
        version: int | None = None,
    ) -> bool:
        return self._run("add", key, value, timeout, version)

    def get(self, key: str, default: Any = None, version: int | None = None) -> Any:
        return self._run("get", key, default, version)

    def set(
        self,
        key: str,
        value: Any,
        timeout: Any = DEFAULT_TIMEOUT,
        version: int | None = None,
    ) -> None:
        self._run("set", key, value, timeout, version)

    def touch(
        self,
        key: str,
        timeout: Any = DEFAULT_TIMEOUT,
        version: int | None = None,
    ) -> bool:
        return self._run("touch", key, timeout, version)

    def delete(self, key: str, version: int | None = None) -> bool:
        return self._run("delete", key, version)

    def get_many(self, keys: Any, version: int | None = None) -> dict[str, Any]:
        return self._run("get_many", keys, version)

    def has_key(self, key: str, version: int | None = None) -> bool:
        return self._run("has_key", key, version)

    def incr(self, key: str, delta: int = 1, version: int | None = None) -> int:
        return self._run("incr", key, delta, version)

    def set_many(
        self,
        data: dict[str, Any],
        timeout: Any = DEFAULT_TIMEOUT,
        version: int | None = None,
    ) -> list[str]:
        return self._run("set_many", data, timeout, version)

    def delete_many(self, keys: Any, version: int | None = None) -> None:
        self._run("delete_many", keys, version)

    def clear(self) -> None:
        self._run("clear")
