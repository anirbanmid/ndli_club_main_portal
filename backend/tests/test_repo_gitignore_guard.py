"""Repo hygiene guard — runtime media must never be tracked (P0 privacy).

``backend/var/`` is the runtime media root (``config/settings/base.py``):
``ONBOARDING_UPLOAD_ROOT`` (onboarding identity documents) and
``ROSTER_IMPORT_ROOT`` (bulk roster CSVs). Both hold personal data, so neither
is source code. The failure this catches is a single careless ``git add -A``:
student documents would land in PERMANENT git history, which costs a history
rewrite and a leaked-data response to undo, versus a one-line prevention.

Two independent checks, deliberately: the ignore rule (catches the rule being
deleted) and the tracked-file listing (catches an already-forced add, which
``.gitignore`` alone does not undo).
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from django.test import SimpleTestCase

_REPO = Path(__file__).resolve().parents[2]
_VAR_REL = "backend/var/"
_GITIGNORE = _REPO / ".gitignore"


def _tracked_media() -> list[str] | None:
    """Runtime-media files git currently tracks, or None when git is absent."""
    if shutil.which("git") is None or not (_REPO / ".git").exists():
        return None
    completed = subprocess.run(
        ["git", "-C", str(_REPO), "ls-files", "--", _VAR_REL],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    if completed.returncode != 0:
        return None
    return [line for line in completed.stdout.splitlines() if line]


class RuntimeMediaIgnoredTests(SimpleTestCase):
    """``backend/var/`` stays untracked and covered by ``.gitignore``."""

    def test_gitignore_carries_the_runtime_media_rule(self) -> None:
        rules = {
            line.strip()
            for line in _GITIGNORE.read_text(encoding="utf8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }
        self.assertIn(
            _VAR_REL,
            rules,
            ".gitignore must ignore backend/var/ — it holds uploaded identity "
            "documents and student roster CSVs, never source.",
        )

    def test_no_runtime_media_file_is_tracked(self) -> None:
        tracked = _tracked_media()
        if tracked is None:
            self.skipTest("git or the .git directory is unavailable")
        self.assertEqual(
            tracked,
            [],
            "personal data tracked under backend/var/ — remove it from the "
            "index (git rm --cached) before it reaches history: "
            f"{tracked}",
        )
