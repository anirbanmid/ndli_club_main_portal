"""HTTP views for the Analytics app — M6 D4 officer audit dashboards.

Mounted at ``/admin/api/v1/dashboards/`` (admin-module routes MUST live under
``/admin/`` — the T3 "admin prefix is the only admin door" pin). Thin adapters:
every figure is derived by ``metrics.py`` / ``ratings.py`` and every scope
decision by ``metrics.visible_zone`` / ``metrics.officers_in_scope``.

Discipline (P0/P4):
* Authorization lives ONLY in ``accounts.policies`` (the gate below) and in the
  metric scoping helpers — views never branch on who the caller is.
* These endpoints are READ-ONLY: no view writes to any table.
* Out-of-scope zones resolve to an empty/own-zone view, never data (P0).
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.policies import CategoryGate

from .metrics import (
    DASHBOARD_SUB_ROLES,
    officers_in_scope,
    recent_audit,
    visible_zone,
    zone_dashboard,
)
from .ratings import CANONICAL_BASELINES, evaluate_officers

#: The one door to the dashboards (admin module, decider sub-roles only).
DASHBOARD_GATE = CategoryGate("admin", DASHBOARD_SUB_ROLES)

_DEFAULT_AUDIT_LIMIT = 20


def _positive_int(raw: Any, default: int) -> int:
    """Parse a query integer safely (never raises on junk input)."""
    try:
        value = int(str(raw))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


class ZoneDashboardView(APIView):
    """``GET /admin/api/v1/dashboards/zone/`` — the caller's derived metrics.

    Query params (all optional, all ignored beyond their declared meaning):
    ``zone`` (central actors only — a zone-bound officer always gets their own
    zone), ``limit`` (audit tail size).
    """

    permission_classes = [IsAuthenticated, DASHBOARD_GATE]

    def get(self, request: Request) -> Response:
        zone = visible_zone(request.user, request.query_params.get("zone", ""))
        payload = zone_dashboard(zone).as_dict()
        payload["recent_audit"] = recent_audit(
            zone,
            limit=_positive_int(
                request.query_params.get("limit"), _DEFAULT_AUDIT_LIMIT
            ),
        )
        return Response(payload)


class OfficerRatingsView(APIView):
    """``GET /admin/api/v1/dashboards/officers/`` — ranked star ratings.

    Same rules as the previous project's metrics screen: the cohort is ranked
    by weighted score and banded RELATIVELY (stars vs the cohort max). A
    zone-bound officer is always a cohort of ONE (their own row).
    """

    permission_classes = [IsAuthenticated, DASHBOARD_GATE]

    def get(self, request: Request) -> Response:
        zone = visible_zone(request.user, request.query_params.get("zone", ""))
        officers = officers_in_scope(request.user, request.query_params.get("zone", ""))
        evaluations = evaluate_officers(
            officers,
            year=_positive_int(request.query_params.get("year"), 0) or None,
            month=_positive_int(request.query_params.get("month"), 0) or None,
            baselines=CANONICAL_BASELINES,
        )
        return Response({"officers": evaluations, "zone_code": zone})


class AuditFeedView(APIView):
    """``GET /admin/api/v1/dashboards/audit/`` — recent audit-trail activity.

    Central admins see every zone (``zone`` param optional); zone officers see
    their own zone only. Read-only over the append-only ledger.
    """

    permission_classes = [IsAuthenticated, DASHBOARD_GATE]

    def get(self, request: Request) -> Response:
        zone = visible_zone(request.user, request.query_params.get("zone", ""))
        return Response(
            {
                "zone_code": zone,
                "results": recent_audit(
                    zone,
                    limit=_positive_int(
                        request.query_params.get("limit"), _DEFAULT_AUDIT_LIMIT
                    ),
                ),
            }
        )
