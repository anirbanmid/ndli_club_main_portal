"""Public HTTP API for Module 1 (BRIEF_M3 M3-1..M3-3, pins V5-V7).

Three anonymous, read-only endpoints (M3-A1/A2 — no auth surface, no writes):

* ``/api/v1/public/telemetry/``   — State/UT breakdown (cached aggregate);
* ``/api/v1/public/directory/``   — typo-tolerant institution search;
* ``/api/v1/public/verify/``      — certificate verifier (six fields, no more).

Discipline (P0/P4):

* Every response is built FROM the single-source computations
  (``domain.telemetry`` / ``domain.search`` / ``certificates.services``) —
  views never recount or re-derive.
* The verifier collapses ``not_found`` into ``invalid`` so the endpoint can
  never be used to enumerate certificate ids (same body, byte for byte).
* Anonymous traffic is rate-limited per IP (sliding window, M1 machinery).
* Cache headers are explicit and bounded; ETags make content change
  invalidate immediately (V7: never stale-forever).
"""
from __future__ import annotations

import json
from hashlib import sha256
from typing import Any

from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.policies import CategoryGate
from apps.accounts.throttles import client_ip, sliding_window_allow
from apps.certificates import services as cert_services
from apps.certificates.ids import is_valid_certificate_id
from apps.domain import search as domain_search
from apps.domain import telemetry as domain_telemetry

#: Public-per-minute limits per client IP (P0: anonymous reads are throttled).
TELEMETRY_LIMIT = 120
DIRECTORY_LIMIT = 60
VERIFY_LIMIT = 30

#: Directory page size (matches REST_FRAMEWORK PAGE_SIZE).
DIRECTORY_PAGE_SIZE = 20

#: Public disclosure keys — single source (P4): services.DISCLOSURE_FIELDS.
PUBLIC_KEYS: tuple[str, ...] = cert_services.DISCLOSURE_FIELDS


def _throttled(scope: str, limit: int, request: Request) -> Response | None:
    """429 when the per-IP sliding window is full (P0)."""
    key = f"m3:{scope}:{client_ip(request)}"
    if not sliding_window_allow(key, limit, 60):
        return Response(
            {"detail": "rate limit exceeded, retry shortly"},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    return None


def _cached(request: Request, payload: dict[str, Any], max_age: int) -> Response:
    """Response with bounded caching + ETag; honors If-None-Match (V7)."""
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    etag = f'"{sha256(body.encode()).hexdigest()}"'
    if request.headers.get("If-None-Match", "").strip() == etag:
        response = Response(status=status.HTTP_304_NOT_MODIFIED)
    else:
        response = Response(payload)
    response["ETag"] = etag
    response["Cache-Control"] = f"public, max-age={max_age}"
    return response


def _invalid_verdict() -> dict[str, Any]:
    """The indistinguishable failure body (anti-enumeration, P0).

    Not-found, bad signature and malformed ids all produce THIS dict —
    byte-for-byte identical responses.
    """
    return {key: None for key in PUBLIC_KEYS} | {"status": cert_services.STATUS_INVALID}


class TelemetryView(APIView):
    """M3-1: State/UT breakdown. Chart and accessible table read THIS."""

    authentication_classes: list = []
    permission_classes = [CategoryGate("public")]

    def get(self, request: Request) -> Response:
        limited = _throttled("telemetry", TELEMETRY_LIMIT, request)
        if limited is not None:
            return limited
        data = domain_telemetry.get_telemetry()
        payload = {
            "states": data["states"],
            "totals": data["totals"],
        }
        return _cached(request, payload, domain_telemetry.HTTP_MAX_AGE_SECONDS)


class DirectorySearchView(APIView):
    """M3-2: directory search (q + state/district/AISHE filters, paginated)."""

    authentication_classes: list = []
    permission_classes = [CategoryGate("public")]

    def get(self, request: Request) -> Response:
        limited = _throttled("directory", DIRECTORY_LIMIT, request)
        if limited is not None:
            return limited
        queryset = domain_search.directory_search(
            q=str(request.query_params.get("q", "")).strip(),
            state=str(request.query_params.get("state", "")).strip(),
            district=str(request.query_params.get("district", "")).strip(),
            aishe=str(request.query_params.get("aishe", "")).strip(),
        )
        paginator = PageNumberPagination()
        paginator.page_size = DIRECTORY_PAGE_SIZE
        page = paginator.paginate_queryset(queryset, request)
        rows = [
            {
                "code": inst.code,
                "name": inst.name,
                "aishe_code": inst.aishe_code,
                "state": {"code": inst.state.code, "name": inst.state.name},
                "district": (
                    {"code": inst.district.code, "name": inst.district.name}
                    if inst.district
                    else None
                ),
            }
            for inst in page or []
        ]
        payload = {
            "count": paginator.page.paginator.count if page is not None else 0,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "results": rows,
        }
        return _cached(request, payload, domain_telemetry.HTTP_MAX_AGE_SECONDS)


class VerifyCertificateView(APIView):
    """M3-3: certificate verifier — exactly six public fields, no more."""

    authentication_classes: list = []
    permission_classes = [CategoryGate("public")]

    def get(self, request: Request) -> Response:
        limited = _throttled("verify", VERIFY_LIMIT, request)
        if limited is not None:
            return limited
        certificate_id = request.query_params.get("id")
        if certificate_id is None:
            return Response(
                {"detail": "missing certificate id"}, status=status.HTTP_400_BAD_REQUEST
            )
        certificate_id = certificate_id.strip()
        if not is_valid_certificate_id(certificate_id):
            return _cached(request, _invalid_verdict(), 60)
        result = cert_services.verify_certificate(certificate_id)
        if result.disclosure is None:
            # invalid AND not_found land here — identical bodies (P0).
            return _cached(request, _invalid_verdict(), 60)
        # Build strictly from the six-field disclosure (P4/P0: nothing extra).
        payload = {key: result.disclosure[key] for key in PUBLIC_KEYS}
        return _cached(request, payload, 60)
