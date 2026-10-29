"""Health endpoints.

- /health/        liveness: the process is up and can serve requests.
- /health/ready/  readiness: backing services (database, cache) respond.

These endpoints are public and intentionally expose no configuration detail
beyond per-check ok/fail status — no hostnames, credentials or versions.
"""

from django.core.cache import cache
from django.db import connection
from django.http import HttpRequest, JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def liveness(request: HttpRequest) -> JsonResponse:
    """Liveness probe: always 200 while the process can serve requests."""
    return JsonResponse({"status": "ok"})


@require_GET
def readiness(request: HttpRequest) -> JsonResponse:
    """Readiness probe: 200 when database and cache are reachable, else 503."""
    checks: dict[str, bool] = {}

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["database"] = True
    except Exception:  # noqa: BLE001 - probe must never raise
        checks["database"] = False

    try:
        cache.set("healthcheck", "ok", timeout=5)
        checks["cache"] = cache.get("healthcheck") == "ok"
    except Exception:  # noqa: BLE001 - probe must never raise
        checks["cache"] = False

    ready = all(checks.values())
    payload = {"status": "ready" if ready else "unavailable", "checks": checks}
    return JsonResponse(payload, status=200 if ready else 503)
