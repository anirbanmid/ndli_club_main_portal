"""Base settings shared by every environment.

Everything is driven by environment variables (documented in .env.example at the
repository root). Secrets are never committed; DJANGO_SECRET_KEY is required in
production and falls back to an insecure value only in the dev settings.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/


def env(key: str, default: str | None = None) -> str | None:
    """Read a single environment variable."""
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
    # Project apps (spec section 2: cross-cutting modules)
    "apps.core",
    "apps.accounts",
    "apps.institutions",
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

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
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

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Django REST Framework / OpenAPI --------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    # Milestone M1 replaces this with the central deny-by-default policy layer.
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
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
CSRF_COOKIE_SAMESITE = "Lax"
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "no-referrer"

# --- Email / SMS (provider-agnostic; console drivers in development) ------

EMAIL_BACKEND = env(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "noreply@club.ndl.iitkgp.ac.in")
# SMS_BACKEND is consumed by the notifications adapter (delivered in a later
# milestone). Valid planned values: console | mock | <provider>.
SMS_BACKEND = env("SMS_BACKEND", "console")

# --- Logging (no PII, no tokens — spec section 9) -------------------------

LOG_LEVEL = env("LOG_LEVEL", "INFO")

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
