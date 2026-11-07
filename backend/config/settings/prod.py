"""Production settings.

Hard requirements (the process refuses to start otherwise):

- DJANGO_SECRET_KEY      a real secret, supplied via environment only
- DJANGO_ALLOWED_HOSTS   non-empty list of public hostnames
- DATABASE_URL           a PostgreSQL URL (postgres:// or postgresql://);
                         SQLite is never used in production

Recommended (documented in .env.example): DJANGO_CSRF_TRUSTED_ORIGINS,
REDIS_URL, MINIO_* with real credentials.
"""

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403 - settings module style
from .base import ALLOWED_HOSTS, SECRET_KEY, env, env_list  # noqa: F401

DEBUG = False

# B-5 (settings batch 2026-11-08): fail closed on any placeholder or weak
# key - .env.example used to ship "change-me-in-production" and sailed past
# the old single-value guard. Short keys are rejected outright.
if (
    SECRET_KEY == "dev-only-insecure-secret-key"
    or SECRET_KEY == "change-me-in-production"
    or len(SECRET_KEY) < 32
):
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be set to a strong unique value (>= 32 "
        "characters) when using config.settings.prod."
    )

if not ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        "DJANGO_ALLOWED_HOSTS must be set when using config.settings.prod."
    )

_database_url = env("DATABASE_URL")
if not _database_url:
    raise ImproperlyConfigured(
        "DATABASE_URL must be set to a PostgreSQL URL when using "
        "config.settings.prod. SQLite is not supported in production."
    )
if not _database_url.startswith(("postgres://", "postgresql://")):
    raise ImproperlyConfigured(
        "DATABASE_URL must be a PostgreSQL URL (postgres:// or postgresql://) "
        "when using config.settings.prod."
    )

# Render (and similar hosts) hand out a transaction-mode POOLER URL on port
# 6543. Persistent client connections through such a pooler are unsafe and
# have hung the interpreter at connection close (deploy freeze after
# "No migrations to apply."), so the pooler is auto-detected and
# conn_max_age is forced to 0 there. Direct Postgres keeps the M2 defaults.
_pooled = ":6543" in _database_url or "pgbouncer" in _database_url
DATABASES = {
    "default": dj_database_url.parse(
        _database_url,
        # M2 capacity hygiene (P2 / BRIEF_M2 §3): persistent connections with
        # health checks. Default 60s suits direct Postgres; behind a
        # transaction-mode pooler (pgBouncer, the documented 110K setup) the
        # pooler holds the connections instead.
        conn_max_age=0 if _pooled else int(env("DJANGO_CONN_MAX_AGE", "60")),
        conn_health_checks=not _pooled,
    )
}
DATABASES["default"].setdefault("OPTIONS", {}).update(
    {"connect_timeout": 10, "keepalives": 1, "keepalives_idle": 30}
)

# Production always uses Redis for cache and Celery.
#
# The backend is ResilientRedisCache, not stock RedisCache: this process has
# no shell access and migrations run on deploy, so a Redis outage must degrade
# to a process-local cache and log an ERROR rather than turn every throttled
# view (login, public telemetry/directory/verify) into an HTTP 500. See
# apps/core/cache.py for the degradation contract.
CACHES = {
    "default": {
        "BACKEND": "apps.core.cache.ResilientRedisCache",
        "LOCATION": env("REDIS_URL", "redis://redis:6379/0"),
    }
}

# HTTPS is terminated by the nginx reverse proxy (infra/nginx.conf).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# "Name:email" pairs for error reporting (no secrets are ever emailed).
ADMINS: list[tuple[str, str]] = [
    tuple(item.split(":", 1))  # type: ignore[misc]
    for item in env_list("DJANGO_ADMINS")
    if ":" in item
]
