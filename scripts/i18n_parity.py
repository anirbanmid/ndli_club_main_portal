#!/usr/bin/env python3
"""i18n catalogue parity tool (M6 D5 — natural-key catalogues).

Modes:
  report   — show key counts + missing per catalogue.
  scaffold — fill every missing key in every catalogue with its English
             natural key as fallback value (identical UX to today's
             missing-key fallback), recording scaffolded keys in
             src/i18n/_scaffold_todo.json so a translation pass can find
             exactly what is still untranslated. Existing translations are
             never overwritten.
  check    — exit 1 unless every source t() key exists in every catalogue
             (the parity gate for D7).

English is the 20th "catalogue": natural keys mean the key IS the English
string, so no en.json is needed.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
SRC = FRONTEND / "src"
I18N = SRC / "i18n"
TODO = I18N / "_scaffold_todo.json"

KEY_RE = re.compile(r"""\bt\(\s*(["'])((?:\\.|(?!\1).)*)\1""")


def source_keys() -> set[str]:
    keys: set[str] = set()
    for f in list(SRC.rglob("*.ts")) + list(SRC.rglob("*.tsx")):
        if I18N in f.parents:
            continue
        for m in KEY_RE.finditer(f.read_text()):
            keys.add(m.group(2))
    return keys


def catalogues() -> dict[str, dict]:
    return {
        p.stem: json.loads(p.read_text())
        for p in sorted(I18N.glob("*.json"))
        if not p.name.startswith("_")
    }


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "report"
    keys = source_keys()
    cats = catalogues()
    if not cats:
        print("no catalogues found", file=sys.stderr)
        return 2

    if mode == "report":
        print(f"source keys: {len(keys)}")
        for name, cat in cats.items():
            missing = sorted(keys - set(cat))
            extra = sorted(set(cat) - keys)
            print(f"  {name}: {len(cat)} keys, missing={len(missing)}, stale={len(extra)}")
        return 0

    if mode == "scaffold":
        todo = json.loads(TODO.read_text()) if TODO.exists() else {}
        changed = False
        for name, cat in cats.items():
            missing = sorted(keys - set(cat))
            for k in missing:
                cat[k] = k  # English natural-key fallback
            if missing:
                changed = True
                merged = sorted(set(todo.get(name, [])) | set(missing))
                todo[name] = merged
                (I18N / f"{name}.json").write_text(
                    json.dumps(cat, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
                )
            print(f"  {name}: scaffolded {len(missing)} keys")
        if changed or not TODO.exists():
            TODO.write_text(json.dumps(todo, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
        print(f"todo tracker: {TODO} ({sum(len(v) for v in todo.values())} pending translations)")
        return 0

    if mode == "check":
        bad = False
        for name, cat in cats.items():
            missing = sorted(keys - set(cat))
            if missing:
                bad = True
                print(f"PARITY FAIL {name}: {len(missing)} missing, e.g. {missing[:3]}")
        if not bad:
            print(f"PARITY OK: {len(keys)} keys x {len(cats)} catalogues")
        return 1 if bad else 0

    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
