"""Single-origin frontend serving (M3-A6).

ONE Django Web Service serves the API and the built frontend: this module
serves ``frontend/dist`` (the Vite build plus the M3-7 pre-rendered shells)
and the collected admin static files. The static-site service is retired.

Design (P3 — robust but SIMPLE; P4 — one cache policy table):
  * ``/assets/*``  -> fingerprinted by Vite: immutable, 1 year.
  * HTML shells    -> ``public, max-age=300, must-revalidate`` + ETag
                      (bounded: V7 "no stale-forever page").
  * other files    -> ``public, max-age=3600`` + ETag.
  * unknown paths  -> SPA fallback to the landing shell (parity with the old
                      static site's ``/* -> /index.html`` rewrite), EXCEPT
                      under ``api/``, ``admin/``, ``health/``, ``static/`` —
                      those keep their own 404s so the API surface can never
                      be masked by an HTML page.
  * missing dist   -> HTTP 503 "frontend build missing" (LOUD misconfiguration,
                      never a silent 404).

Security (P0): GET/HEAD only, resolved paths must stay inside the served
root (containment check), no directory listings, no extension guessing for
the SPA routes. SecurityHeadersMiddleware (outermost) stamps the standard
headers on every response including these.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import (
    FileResponse,
    Http404,
    HttpRequest,
    HttpResponse,
    HttpResponseBase,
)
from django.views.decorators.http import require_http_methods

#: SPA route table — the three public pages (M3-7 pre-rendered shells).
ROUTE_FILES: dict[str, str] = {
    "": "index.html",
    "index.html": "index.html",
    "verify": "verify/index.html",
    "verify/": "verify/index.html",
    "verify/index.html": "verify/index.html",
    "directory": "directory/index.html",
    "directory/": "directory/index.html",
    "directory/index.html": "directory/index.html",
    "clubs": "clubs/index.html",
    "clubs/": "clubs/index.html",
    "clubs/index.html": "clubs/index.html",
    "join": "join/index.html",
    "join/": "join/index.html",
    "join/index.html": "join/index.html",
}

#: Requests under these prefixes never fall through to the SPA fallback.
API_PREFIXES = ("api/", "admin/", "health/", "static/")

IMMUTABLE = "public, max-age=31536000, immutable"
HTML_CACHE = "public, max-age=300, must-revalidate"
FILE_CACHE = "public, max-age=3600"


def _contained(root: Path, rel: str) -> Path | None:
    """Resolve ``rel`` under ``root``; None when it escapes or is not a file."""
    candidate = (root / rel).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def _etag(path: Path) -> str:
    st = path.stat()
    return f'"{st.st_mtime_ns:x}-{st.st_size:x}"'


def _respond(request: HttpRequest, path: Path, cache: str) -> FileResponse:
    response = FileResponse(path.open("rb"), as_attachment=False)
    response["Cache-Control"] = cache
    response["ETag"] = _etag(path)
    response["X-Content-Type-Options"] = "nosniff"
    content_type, _encoding = mimetypes.guess_type(path.name)
    if content_type:
        response["Content-Type"] = content_type
    return response


def _is_spa_path(path: str) -> bool:
    return not any(path.startswith(prefix) for prefix in API_PREFIXES)


@require_http_methods(["GET", "HEAD"])
def serve_frontend(request: HttpRequest, path: str = "") -> HttpResponseBase:
    """Serve the built frontend for every non-API GET (M3-A6)."""
    dist = Path(settings.FRONTEND_DIST)

    if not dist.is_dir():
        return HttpResponse(
            "frontend build missing: run `npm run build` in frontend/ "
            f"(looked in {dist})",
            status=503,
            content_type="text/plain",
        )

    rel = path.strip("/")
    if ".." in Path(rel).parts:
        # P0: traversal attempts never reach the filesystem check — 404.
        raise Http404
    if rel in ROUTE_FILES:
        target = _contained(dist, ROUTE_FILES[rel])
        if target is None:
            return HttpResponse(
                "frontend build incomplete: pre-rendered shell missing",
                status=503,
                content_type="text/plain",
            )
        return _respond(request, target, HTML_CACHE)

    if rel.startswith("assets/"):
        target = _contained(dist, rel)
        if target is None:
            raise Http404
        return _respond(request, target, IMMUTABLE)

    if rel:
        # Real files at the dist root (favicon, icons, …) get file caching;
        # everything else is a client-side route -> landing shell (SPA
        # fallback, parity with the retired static site).
        target = _contained(dist, rel)
        if target is not None:
            return _respond(request, target, FILE_CACHE)
        if _is_spa_path(rel) and "." not in Path(rel).name:
            target = _contained(dist, "index.html")
            if target is None:
                raise Http404
            return _respond(request, target, HTML_CACHE)
        raise Http404

    target = _contained(dist, "index.html")
    if target is None:
        raise Http404
    return _respond(request, target, HTML_CACHE)


@require_http_methods(["GET", "HEAD"])
def serve_static(request: HttpRequest, path: str) -> HttpResponseBase:
    """Serve collected admin static files from ``STATIC_ROOT`` or dist (P0)."""
    root = Path(settings.STATIC_ROOT)
    target = _contained(root, path)
    if target is None and hasattr(settings, "FRONTEND_DIST"):
        dist_static = Path(settings.FRONTEND_DIST) / "static"
        target = _contained(dist_static, path)
    if target is None:
        raise Http404
    return _respond(request, target, FILE_CACHE)
