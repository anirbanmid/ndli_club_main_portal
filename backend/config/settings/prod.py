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
from .base import ALLOWED_HOSTS, env, env_list  # noqa: F401

DEBUG = False

if SECRET_KEY == "dev-only-insecure-secret-key":  # noqa: F405 - imported from base
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be set when using config.settings.prod."
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

DATABASES = {
    "default": dj_database_url.parse(
        _database_url,
        # M2 capacity hygiene (P2 / BRIEF_M2 §3): persistent connections with
        # health checks. Default 60s suits direct Postgres; behind a
        # transaction-mode pooler (pgBouncer, the documented 110K setup) set
        # DJANGO_CONN_MAX_AGE=0 and let the pooler hold the connections
        # (see M2_DEPLOY_GUIDE.md).
        conn_max_age=int(env("DJANGO_CONN_MAX_AGE", "60")),
        conn_health_checks=True,
    )
}

# Production always uses Redis for cache and Celery.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
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
