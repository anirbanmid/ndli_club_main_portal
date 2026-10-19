"""Development settings.

- DEBUG defaults to True (override with DJANGO_DEBUG=false).
- If no DATABASE_URL is set, SQLite is used so tests and `manage.py check` run
  with zero setup. If DATABASE_URL is set (e.g. the docker-compose Postgres),
  it is used instead.
"""
import dj_database_url

from .base import *  # noqa: F403 - settings module style
from .base import ALLOWED_HOSTS, BASE_DIR, SECRET_KEY, env, env_bool  # noqa: F401

DEBUG = env_bool("DJANGO_DEBUG", True)

# Development-only fallback secret. Production refuses to start without a real
# DJANGO_SECRET_KEY (see settings/prod.py).
SECRET_KEY = env("DJANGO_SECRET_KEY", SECRET_KEY)

if not ALLOWED_HOSTS:
    ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"]

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        # M2 capacity hygiene (P2 / BRIEF_M2 §3): persistent connections with
        # health checks, sized for the 110K floor. Behind a transaction-mode
        # pooler (pgBouncer) set DJANGO_CONN_MAX_AGE=0 and pool at the
        # pooler (see M2_DEPLOY_GUIDE.md).
        conn_max_age=int(env("DJANGO_CONN_MAX_AGE", "0")),
        conn_health_checks=True,
    )
}
