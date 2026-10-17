#!/usr/bin/env python3
"""Django management entry point for the NDLI Club Main Portal backend.

Development defaults to ``config.settings.dev`` (SQLite when no DATABASE_URL is
set). Production deployments must set DJANGO_SETTINGS_MODULE=config.settings.prod.
"""
import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:  # pragma: no cover - environment problem, not code
        raise ImportError(
            "Django is not installed or the virtualenv is not active. "
            "Run `make install` first (see README.md)."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
