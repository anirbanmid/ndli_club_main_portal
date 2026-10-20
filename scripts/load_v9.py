#!/usr/bin/env python3
"""V9 load script — reproducible p95 proof for the public read endpoints.

(BRIEF_M3 §4/§5: "p95 < 200ms under the load shape; scripted, reproducible".)

Shape: N workers × M requests each, mixed GETs against the three public API
reads plus the three prerendered pages. Latencies are wall-clock per request
(client-side), reported as p50/p95/p99 per endpoint. Exit code 0 only when
every read endpoint's p95 is under the budget (default 200ms).

stdlib-only (urllib + concurrent.futures) — no install step, runs anywhere
Python 3.12 runs. Usage:

    python3 scripts/load_v9.py --base-url http://127.0.0.1:8000 \
        --workers 8 --requests 50

Tips:
  * Warm the cache first (--warmup 10) — the telemetry endpoint caches behind
    a data-version fingerprint, which is the production shape.
  * Against Render free tier add --budget-ms 1500 (cold starts + shared CPU);
    the hard spec gate (200ms) is for the provisioned deployment.
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

READ_PATHS = [
    "/api/v1/public/telemetry/",
    "/api/v1/public/directory/?q=college",
    "/api/v1/public/verify/?id=NDLI-DEAL-2345",
    "/",
    "/verify/",
    "/directory/",
]


def one_get(base: str, path: str, timeout: float) -> tuple[str, float, int]:
    start = time.perf_counter()
    status = 0
    try:
        with urllib.request.urlopen(base + path, timeout=timeout) as resp:
            status = resp.status
            resp.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
    except OSError:
        status = -1
    return path, (time.perf_counter() - start) * 1000.0, status


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return float("nan")
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, round(pct / 100 * len(ordered)) - 1))
    return ordered[idx]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--requests", type=int, default=50, help="per endpoint")
    parser.add_argument("--warmup", type=int, default=10, help="per endpoint")
    parser.add_argument("--budget-ms", type=float, default=200.0)
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--json-out", default="")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    plan = [(path, i) for i in range(args.requests) for path in READ_PATHS]
    warm = [(path, i) for i in range(args.warmup) for path in READ_PATHS]

    def run(items: list[tuple[str, int]]) -> list[tuple[str, float, int]]:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(one_get, base, path, args.timeout) for path, _ in items]
            return [f.result() for f in futures]

    if warm:
        print(f"warmup: {len(warm)} requests ...", flush=True)
        run(warm)

    print(f"measure: {len(plan)} requests, {args.workers} workers ...", flush=True)
    t0 = time.perf_counter()
    results = run(plan)
    wall = time.perf_counter() - t0

    per_path: dict[str, list[float]] = {}
    failures = 0
    for path, ms, status in results:
        if status <= 0 or status >= 500:
            failures += 1
            continue
        per_path.setdefault(path, []).append(ms)

    report: dict[str, object] = {
        "base_url": base,
        "workers": args.workers,
        "requests_per_endpoint": args.requests,
        "wall_seconds": round(wall, 2),
        "rps": round(len(plan) / wall, 1) if wall else None,
        "budget_ms": args.budget_ms,
        "failures": failures,
        "endpoints": {},
    }

    worst_p95 = 0.0
    print(f"\n{'endpoint':48s} {'p50':>8s} {'p95':>8s} {'p99':>8s} {'n':>5s}")
    for path in READ_PATHS:
        samples = per_path.get(path, [])
        if not samples:
            print(f"{path:48s} {'—':>8s} {'—':>8s} {'—':>8s} {0:5d}  NO SAMPLES")
            report["endpoints"][path] = {"error": "no successful samples"}  # type: ignore[index]
            continue
        p50, p95, p99 = (
            percentile(samples, 50),
            percentile(samples, 95),
            percentile(samples, 99),
        )
        worst_p95 = max(worst_p95, p95)
        verdict = "ok" if p95 < args.budget_ms else "OVER"
        print(f"{path:48s} {p50:7.1f}m {p95:7.1f}m {p99:7.1f}m {len(samples):5d}  {verdict}")
        report["endpoints"][path] = {  # type: ignore[index]
            "p50_ms": round(p50, 2),
            "p95_ms": round(p95, 2),
            "p99_ms": round(p99, 2),
            "mean_ms": round(statistics.fmean(samples), 2),
            "n": len(samples),
        }

    print(
        f"\nworst p95 = {worst_p95:.1f}ms (budget {args.budget_ms:.0f}ms) · "
        f"rps {report['rps']} · failures {failures}"
    )
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
        print(f"report -> {args.json_out}")

    ok = worst_p95 < args.budget_ms and failures == 0 and not any(
        "error" in str(v) for v in report["endpoints"].values()  # type: ignore[union-attr]
    )
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
