"""M6 D5 MCC insights endpoint — read-only strategic report.

``GET /admin/api/v1/governance/insights/report/`` — CentralAdmin/SuperAdminOps
only (MCC = master control; EMPs get the operational desks). Full report
payload from ``.insights.strategic_report`` (P4: one derivation place).
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import SubRole
from apps.accounts.policies import CategoryGate

from . import insights

#: MCC-only (old-project RBAC: EMPs do not get the strategic report).
INSIGHTS_GATE = CategoryGate(
    "admin", {SubRole.CENTRAL_ADMIN, SubRole.SUPER_ADMIN_OPS}
)


class StrategicReportView(APIView):
    """``GET .../insights/report/`` — the MCC strategic report (read-only)."""

    permission_classes = [IsAuthenticated, INSIGHTS_GATE]

    def get(self, request: Request) -> Response:
        return Response(insights.strategic_report(), status=status.HTTP_200_OK)
