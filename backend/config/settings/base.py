"""Base settings shared by every environment.

Everything is driven by environment variables (documented in .env.example at the
repository root). Secrets are never committed; DJANGO_SECRET_KEY is required in
production and falls back to an insecure value only in the dev settings.
"""
import os
from pathlib import Path
from typing import overload

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/


@overload
def env(key: str, default: str) -> str: ...


@overload
def env(key: str, default: None = None) -> str | None: ...


def env(key: str, default: str | None = None) -> str | None:
    """Read a single environment variable (a default makes it non-optional)."""
    return os.environ.get(key, default)


def env_bool(key: str, default: bool = False) -> bool:
    """Read a boolean environment variable (true/1/yes/on, case-insensitive)."""
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_list(key: str, default: str = "") -> list[str]:
    """Read a comma-separated environment variable into a clean list."""
    raw = os.environ.get(key, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# --- Core -----------------------------------------------------------------

SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-only-insecure-secret-key")

DEBUG = False

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS")

# Single-origin deployment: the frontend and the API share one origin and the
# API lives under /api/. CORS is only relevant when the Vite dev server runs on
# a different port during development.
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CORS_ALLOW_CREDENTIALS = True

# --- Applications ---------------------------------------------------------

# --- Onboarding (M4 D2) ---
# Private storage for onboarding documents (W3): hash-addressed,
# never served inline; only the attachment download view reads it.
ONBOARDING_UPLOAD_ROOT = BASE_DIR / "var" / "onboarding_uploads"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "corsheaders",
    "rest_framework",
    "drf_spectacular",
    # PostgreSQL integration: pg_trgm lookups for the public directory
    # search (M3-2). No models; on non-Postgres it simply sits idle.
    "django.contrib.postgres",
    # Project apps (spec section 2: cross-cutting modules)
    "apps.core",
    "apps.domain",
    "apps.accounts",
    "apps.institutions",
    "apps.onboarding",
    "apps.clubs",
    "apps.members",
    "apps.activities",
    "apps.certificates",
    "apps.analytics_reports",
    "apps.sharing",
    "apps.succession",
    "apps.governance",
    "apps.grievances",
    "apps.notifications",
    "apps.audit",
    "apps.migration_salvage",
    "apps.public_api",
]

# M2U (A10 Option B, owner 2026-10-19): one person = one record. The custom
# user model carries identity + profile on one table (db_table override;
# renamed auth_user -> accounts_user in the post-M3 hygiene batch, migration
# 0004) so every existing user FK keeps its target.
AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    # Outermost first: stamps the security-header policy + audit request id on
    # EVERY response, including 4xx/5xx (BRIEF_M1.md §6 / T6).
    "apps.core.middleware.SecurityHeadersMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    # M3-8: conditional GETs (ETag/If-None-Match -> 304) for the SPA/static
    # responses served by apps.core.frontend and cached API payloads.
    "django.middleware.http.ConditionalGetMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# --- Databases / cache / queue -------------------------------------------
# DATABASES is defined in settings/dev.py and settings/prod.py.
# dev.py  : DATABASE_URL if set, otherwise SQLite (zero-setup tests).
# prod.py : requires a PostgreSQL DATABASE_URL, refuses to start otherwise.

_redis_url = env("REDIS_URL", "redis://localhost:6379/0")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": _redis_url,
    }
    if env_bool("USE_REDIS_CACHE", False)
    else {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "ndli-club",
    }
}

CELERY_BROKER_URL = env("CELERY_BROKER_URL", _redis_url)
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", _redis_url)
CELERY_TASK_TIME_LIMIT = 30 * 60
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"

# --- Storage (S3-compatible; MinIO in dev) --------------------------------

MINIO_ENDPOINT = env("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = env("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = env("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = env("MINIO_BUCKET", "ndli-club-private")
MINIO_USE_SSL = env_bool("MINIO_USE_SSL", False)

# --- Internationalisation -------------------------------------------------
# Timestamps are stored in UTC and displayed in IST (spec section 8).

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static files ---------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# M3-A6 single-origin: the built frontend (Vite dist + M3-7 pre-rendered
# shells) served by Django. Sibling of backend/ in the repository layout.
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Django REST Framework / OpenAPI --------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    # Milestone M1: the central deny-by-default policy layer. Every view must
    # opt in with an explicit ``CategoryGate`` / ``ObjectScope`` (BRIEF_M1.md §4).
    "DEFAULT_PERMISSION_CLASSES": [
        "apps.accounts.policies.DenyAll",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "NDLI Club Main Portal API",
    "DESCRIPTION": (
        "OpenAPI schema for the NDLI Club Main Portal "
        "(NDLI, IIT Kharagpur)."
    ),
    "VERSION": "0.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# --- Security (baseline; the full hardening pass is milestone M1) ---------

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", False)
CSRF_COOKIE_SAMESITE = "Lax"
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "no-referrer"

# Argon2id (RFC 9106 third variant) — BRIEF_M1.md §6. The custom hasher pins
# the type explicitly so the requirement holds regardless of Django defaults.
PASSWORD_HASHERS = [
    "apps.accounts.hashers.Argon2idPasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
]

# Absolute origin used to build the F2/F4 single-use email links. The token
# rides in the URL FRAGMENT, never the query string (docs/SECURITY.md).
SITE_URL = env("SITE_URL", "http://localhost:8000")

# --- Email / SMS (provider-agnostic; console drivers in development) ------

EMAIL_BACKEND = env(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "noreply@club.ndl.iitkgp.ac.in")
# The ONE email provider interface (apps.accounts.email_providers).
# A2: SENDGRID_API_KEY empty => the console driver (nothing leaves the
# machine). SendGrid is configured before client delivery (M10 handover).
EMAIL_PROVIDER = env("EMAIL_PROVIDER", "")
SENDGRID_API_KEY = env("SENDGRID_API_KEY", "")
# SMS_BACKEND is consumed by the notifications adapter (delivered in a later
# milestone). Valid planned values: console | mock | <provider>.
SMS_BACKEND = env("SMS_BACKEND", "console")

# --- Logging (no PII, no tokens — spec section 9) -------------------------

LOG_LEVEL = env("LOG_LEVEL", "INFO")

# --- M3 certificate HMAC keyring (BRIEF_M3 §4a, pin V3) ---------------------
# Key MATERIAL lives only in the environment/secret store — never the
# database, never a log line, never an API response. Parsing/validation is
# single-sourced in apps/certificates/signing.py (P4); settings only carries
# the raw environment strings through.
CERT_HMAC_KEYRING = env("CERT_HMAC_KEYRING", "")
CERT_HMAC_ACTIVE_KEY_ID = env("CERT_HMAC_ACTIVE_KEY_ID", "")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {
            "format": "{asctime} {levelname} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
}


# --- M4 D4 roster bulk import (BRIEF_M4 §3 D4 / §4b) -----------------------

# Uploaded CSVs are hash-stored per club under this root (P0 hygiene).
ROSTER_IMPORT_ROOT = BASE_DIR / "var" / "roster_imports"
# Hard caps per upload (BRIEF §3 D4): 10k rows / 5 MB.
ROSTER_IMPORT_MAX_ROWS = 10_000
ROSTER_IMPORT_MAX_BYTES = 5 * 1024 * 1024
# Chunked writes: one short transaction per chunk (P2 — no long transactions).
ROSTER_IMPORT_CHUNK_SIZE = 500
# Sync-chunked fallback runner ceiling (M4-A4 free-tier reality).
ROSTER_IMPORT_SYNC_LIMIT = 10_000
# The async seam (§4b): flip USE_CELERY + the dotted task path and the SAME
# pipeline runs on a worker — zero code change (M4-A4).
ROSTER_IMPORT_USE_CELERY = False
ROSTER_IMPORT_CELERY_TASK = ""
