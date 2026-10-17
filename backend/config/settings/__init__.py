"""Settings package.

- ``base``  shared configuration, environment-variable driven
- ``dev``   local development (SQLite fallback, zero-setup tests)
- ``prod``  production (requires PostgreSQL via DATABASE_URL)

Select with DJANGO_SETTINGS_MODULE (default: config.settings.dev).
"""
