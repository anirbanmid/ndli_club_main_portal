# ruff: noqa: E402
"""Convenience runner to seed canonical NDLI Clubs for all 36 States & UTs."""

from __future__ import annotations

import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django

django.setup()

from django.core.management import call_command

if __name__ == "__main__":
    call_command("seed_all_states")
