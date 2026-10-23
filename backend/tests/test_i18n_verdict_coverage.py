"""DEC2 guard — every verdict the UI can render exists in the Hindi catalogue.

The wizard and the auth/join surfaces render server verdicts through DYNAMIC
i18n lookups — ``t(detail)``, ``t(error.message)``, ``t(closed.detail)`` — so a
missing key never fails a build. i18next falls back to the key itself, which is
the English original, and a Hindi reader silently gets English. The static
``t('literal')`` scan cannot see these call sites, which is how a
``missing_t_keys = 0`` report coexisted with 45 untranslated verdicts.

This test closes that blind spot. It fails when:

* any ``OnboardingError`` message raised in ``backend/apps`` has no key;
* any ``*_VERDICTS`` / ``CSV_REASONS`` / ``ROSTER_ERRORS`` literal in
  ``frontend/src/lib`` has no key;
* a NEW f-string verdict appears whose rendered forms are not registered in
  ``DYNAMIC_VERDICTS`` below (so it cannot be added without being catalogued).

Rendering ``t(x)`` where ``x`` is absent from ``hi.json`` yields ``x`` unchanged
— so "untranslated" here means "still English".
"""
from __future__ import annotations

import ast
import json
import re
from pathlib import Path
from typing import Any

from django.conf import settings
from django.test import SimpleTestCase

REPO = Path(settings.BASE_DIR).resolve().parent
HI_JSON = REPO / "frontend" / "src" / "i18n" / "hi.json"
BACKEND_APPS = Path(settings.BASE_DIR).resolve() / "apps"
LIB = REPO / "frontend" / "src" / "lib"

#: Verdicts built with an f-string / implicit concat. The rendered form is the
#: catalogue key (i18n has no idea what ``INDIAN_MOBILE_DIGITS`` is), so each
#: template is bound to exactly the bytes the server can emit. A template
#: listed here with an EMPTY list means "intentionally untranslated" — used
#: only if a verdict is deliberately English-only.
DYNAMIC_VERDICTS: dict[str, list[str]] = {
    "f'A {label} is required.'": [
        "A institution name is required.",
        "A club name is required.",
        "A zone code is required.",
        "A state code is required.",
        "A district code is required.",
    ],
    "f'{key} cannot be empty.'": [
        "institution_name cannot be empty.",
        "club_name cannot be empty.",
        "zone_code cannot be empty.",
        "state_code cannot be empty.",
        "district_code cannot be empty.",
    ],
    "f'The document must be 1-{UPLOAD_MAX_BYTES // (1024 * 1024)} MB.'": [
        "The document must be 1-10 MB.",
    ],
}

#: ``const X = { ... } as const;`` blocks in frontend/src/lib whose values are
#: rendered to the user (verbatim verdicts, or labels behind a dynamic ``t()``).
TS_VERDICT_BLOCKS = ("AUTH_VERDICTS", "JOIN_VERDICTS", "ONBOARDING_VERDICTS",
                     "CSV_REASONS", "ROSTER_ERRORS")


def _catalogue() -> dict[str, Any]:
    """Parse hi.json strictly — object, string values only, no BOM drift."""
    raw = HI_JSON.read_bytes()
    assert not raw.startswith(bytes.fromhex("efbbbf")), "hi.json must not carry a BOM"
    data = json.loads(raw.decode("utf-8"))
    assert isinstance(data, dict), "hi.json must be a flat key -> string object"
    for key, value in data.items():
        assert isinstance(key, str) and isinstance(value, str), (
            f"hi.json must be string -> string; got {key!r} -> {value!r}"
        )
    return data


def _resolve(node: ast.AST, constants: dict[str, Any], depth: int = 0) -> str | None:
    """Render a literal, f-string or implicit-concat message where possible."""
    if depth > 8:
        return None
    try:
        value = ast.literal_eval(node)
    except Exception:  # noqa: BLE001 - not a plain literal, fall through
        value = None
    if isinstance(value, str):
        return value
    if isinstance(node, ast.JoinedStr):
        parts: list[str] = []
        for piece in node.values:
            if isinstance(piece, ast.Constant) and isinstance(piece.value, str):
                parts.append(piece.value)
            elif isinstance(piece, ast.FormattedValue):
                name = ast.unparse(piece.value)
                if name not in constants:
                    return None
                parts.append(str(constants[name]))
            else:
                return None
        return "".join(parts)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left = _resolve(node.left, constants, depth + 1)
        right = _resolve(node.right, constants, depth + 1)
        if left is None or right is None:
            return None
        return left + right
    return None


def _module_constants(tree: ast.Module) -> dict[str, Any]:
    """Module-level literals ONLY — a function-local ``label`` must never be
    mistaken for a constant, or it would wrongly "resolve" an f-string."""
    constants: dict[str, Any] = {}
    for node in tree.body:
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
        ):
            try:
                constants[node.targets[0].id] = ast.literal_eval(node.value)
            except Exception:  # noqa: BLE001 - non-literal module value
                pass
    return constants


def _backend_messages() -> tuple[set[str], list[str]]:
    """Every OnboardingError message: (renderable, unresolved-template-sources)."""
    constants: dict[str, Any] = {}
    trees: list[tuple[Path, ast.Module]] = []
    sources = (p for p in BACKEND_APPS.rglob("*.py") if "__pycache__" not in str(p))
    for path in sorted(sources):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        trees.append((path, tree))
        constants.update(_module_constants(tree))

    renderable: set[str] = set()
    unresolved: list[str] = []
    for _path, tree in trees:
        for node in ast.walk(tree):
            if not (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "OnboardingError"
                and node.args
            ):
                continue
            rendered = _resolve(node.args[0], constants)
            if rendered is None:
                unresolved.append(ast.unparse(node.args[0]))
            else:
                renderable.add(rendered)
    return renderable, sorted(set(unresolved))


def _ts_verdict_literals() -> set[str]:
    """String values of the verdict/reason const blocks in frontend/src/lib."""
    found: set[str] = set()
    for path in sorted(LIB.glob("*.ts")):
        source = path.read_text(encoding="utf-8")
        for name in TS_VERDICT_BLOCKS:
            match = re.search(
                rf"export const {name} = \{{(.*?)\}} as const;", source, re.S
            )
            if match is None:
                continue
            for value in re.findall(r":\s*'((?:[^'\\]|\\.)*)'", match.group(1)):
                found.add(value.replace("\\'", "'").replace("\\\\", "\\"))
    return found


class VerdictCatalogueCoverageTests(SimpleTestCase):
    """A verdict nobody translated must fail the suite, not the reader."""

    #: Bound in setUpClass; declared so mypy sees them too.
    hi: dict[str, Any]
    backend: set[str]
    unresolved: list[str]
    ts: set[str]

    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        cls.hi = _catalogue()
        cls.backend, cls.unresolved = _backend_messages()
        cls.ts = _ts_verdict_literals()

    def test_backend_verdicts_are_catalogued(self) -> None:
        missing = sorted(m for m in self.backend if m not in self.hi)
        self.assertEqual(
            missing, [], "OnboardingError messages with no hi.json key"
        )

    def test_every_unresolved_backend_verdict_is_registered(self) -> None:
        unknown = [src for src in self.unresolved if src not in DYNAMIC_VERDICTS]
        self.assertEqual(
            unknown,
            [],
            "f-string OnboardingError verdicts missing from DYNAMIC_VERDICTS "
            "(add their rendered forms so they get translated)",
        )

    def test_registered_dynamic_verdicts_are_catalogued(self) -> None:
        missing = sorted(
            message
            for messages in DYNAMIC_VERDICTS.values()
            for message in messages
            if message not in self.hi
        )
        self.assertEqual(missing, [], "registered dynamic verdicts with no hi.json key")

    def test_frontend_verdict_literals_are_catalogued(self) -> None:
        missing = sorted(m for m in self.ts if m not in self.hi)
        self.assertEqual(
            missing, [], "frontend verdict/reason literals with no hi.json key"
        )

    def test_the_verdict_block_scan_actually_found_the_blocks(self) -> None:
        """Guard against a rename silently emptying the assertions above."""
        sources = [p.read_text(encoding="utf-8") for p in sorted(LIB.glob("*.ts"))]
        for name in TS_VERDICT_BLOCKS:
            self.assertTrue(
                any(f"export const {name} = {{" in src for src in sources),
                f"{name} not found in frontend/src/lib — update TS_VERDICT_BLOCKS",
            )

    def test_the_backend_scan_actually_found_verdicts(self) -> None:
        self.assertGreater(len(self.backend), 15)
        self.assertGreater(len(self.ts), 40)
