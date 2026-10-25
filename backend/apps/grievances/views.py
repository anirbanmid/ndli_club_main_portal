"""HTTP views for the Grievances app — M6 D3b.

Thin adapters over ``grievances.services`` (the rules live there). Discipline
(P0/P4), mirroring the charter desk:

* Authorization decisions live ONLY in ``accounts.policies`` (the gates below)
  plus the service-level scoping (``services.queue_for`` /
  ``services.tickets_for_club_authority``) — out-of-scope IDs are
  indistinguishable from missing ones: 404, never data.
* Views never branch on who the caller is (T3 greps for that).
* The intake endpoint reads EXACTLY THREE body fields (``club_id``,
  ``subject``, ``description``) and the resolve endpoint reads EXACTLY TWO
  (``decision``, ``reason``) — no mass-assignment of status/zone/reminder
  fields is possible, ever.
"""
from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.policies import CLUB_AUTHORITY_GATE, CategoryGate
from apps.domain.models import Club

from .models import GrievanceTicket
from .services import (
    CENTRAL_SUB_ROLES,
    DECIDER_SUB_ROLES,
    GrievanceError,
    create_ticket,
    queue_for,
    resolve_ticket,
    sweep,
    tickets_for_club_authority,
)

#: The club-side door (club module, club authorities only).
# CLUB_AUTHORITY_GATE is shared with the other club surfaces.

#: The dispatcher door (admin module, decider sub-roles only).
DISPATCHER_GATE = CategoryGate("admin", DECIDER_SUB_ROLES)

#: The sweep door (admin module, central sub-roles only).
SWEEP_GATE = CategoryGate("admin", CENTRAL_SUB_ROLES)

_PAGE_SIZE = 20

_ERROR_STATUS = {
    "not_found": status.HTTP_404_NOT_FOUND,
    "not_a_decider": status.HTTP_403_FORBIDDEN,
    "not_club_authority": status.HTTP_403_FORBIDDEN,
}


def _error(exc: GrievanceError) -> Response:
    code = str(exc)
    return Response(
        {"error": code},
        status=_ERROR_STATUS.get(code, status.HTTP_400_BAD_REQUEST),
    )


def _ticket_payload(ticket: GrievanceTicket) -> dict[str, Any]:
    return {
        "id": str(ticket.pk),
        "club_id": str(ticket.club_id),
        "raised_by": getattr(ticket.raised_by, "username", None),
        "subject": ticket.subject,
        "description": ticket.description,
        "status": ticket.status,
        "state_code": ticket.state_code,
        "zone_code": ticket.zone_code,
        "resolved_at": ticket.resolved_at,
        "resolved_by": getattr(ticket.resolved_by, "username", None),
        "reminder_due_at": ticket.reminder_due_at,
        "admin_reminder_due_at": ticket.admin_reminder_due_at,
        "is_admin_escalated": ticket.is_admin_escalated,
        "escalated_at": ticket.escalated_at,
        "created_at": ticket.created_at,
    }


def _sla_payload(event: Any) -> dict[str, Any]:
    """SLA ledger row — kind/occurred_at/note only (no actor, no internals)."""
    return {
        "kind": event.kind,
        "occurred_at": event.occurred_at,
        "note": event.note,
    }


def _detail_payload(ticket: GrievanceTicket) -> dict[str, Any]:
    payload = _ticket_payload(ticket)
    payload["sla_events"] = [_sla_payload(e) for e in ticket.sla_events.all()]
    return payload


# ---------------------------------------------------------------------------
# Club side — own-club tickets (module namespace "club")
# ---------------------------------------------------------------------------


class ClubTicketListCreateView(APIView):
    """``GET/POST /api/v1/grievances/`` — own-club list + intake.

    Intake reads exactly three body fields; every other key (status,
    zone_code, reminder fields, ...) is deliberately ignored.
    """

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def get(self, request: Request) -> Response:
        try:
            qs = tickets_for_club_authority(request.user)
        except GrievanceError as exc:
            return _error(exc)
        paginator = PageNumberPagination()
        paginator.page_size = _PAGE_SIZE
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            [_ticket_payload(t) for t in page or []]
        )

    def post(self, request: Request) -> Response:
        # Exactly three fields — mass-assignment guard (P0).
        club_id = request.data.get("club_id")
        subject = str(request.data.get("subject", ""))
        description = str(request.data.get("description", ""))
        try:
            club = Club.objects.filter(pk=club_id).first()
        except (ValueError, TypeError, ValidationError):
            club = None
        if club is None:
            return _error(GrievanceError("not_found"))
        try:
            actor = request.user
            ticket = create_ticket(
                raised_by=actor,
                club=club,
                subject=subject,
                description=description,
                request=request,
            )
        except GrievanceError as exc:
            return _error(exc)
        return Response(_ticket_payload(ticket), status=status.HTTP_201_CREATED)


class ClubTicketDetailView(APIView):
    """``GET /api/v1/grievances/<pk>/`` — own-club ticket + SLA ledger.

    A ticket of another club is indistinguishable from a missing one (404).
    """

    permission_classes = [IsAuthenticated, CLUB_AUTHORITY_GATE]

    def get(self, request: Request, pk: Any) -> Response:
        ticket = tickets_for_club_authority(request.user).filter(pk=pk).first()
        if ticket is None:
            return _error(GrievanceError("not_found"))
        return Response(_detail_payload(ticket))


# ---------------------------------------------------------------------------
# Admin dispatcher side — module namespace "admin" (mounted under /admin/)
# ---------------------------------------------------------------------------


class GrievanceQueueView(APIView):
    """``GET /admin/api/v1/grievances/queue/`` — the dispatcher queue."""

    permission_classes = [IsAuthenticated, DISPATCHER_GATE]

    def get(self, request: Request) -> Response:
        try:
            qs = queue_for(request.user)
        except GrievanceError as exc:
            return _error(exc)
        paginator = PageNumberPagination()
        paginator.page_size = _PAGE_SIZE
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            [_ticket_payload(t) for t in page or []]
        )


class GrievanceDetailView(APIView):
    """``GET /admin/api/v1/grievances/<pk>/`` — ticket + SLA ledger.

    Zone scoping via ``queue_for``: cross-zone IDs are 404, never data (P0).
    """

    permission_classes = [IsAuthenticated, DISPATCHER_GATE]

    def get(self, request: Request, pk: Any) -> Response:
        try:
            ticket = queue_for(request.user).filter(pk=pk).first()
        except GrievanceError as exc:
            return _error(exc)
        if ticket is None:
            return _error(GrievanceError("not_found"))
        return Response(_detail_payload(ticket))


class GrievanceResolveView(APIView):
    """``POST .../resolve/`` — record a Resolved / Not Resolved mark.

    The body is read for EXACTLY TWO fields (``decision``, ``reason``) — no
    mass-assignment of status/reminder fields is possible (P0).
    """

    permission_classes = [IsAuthenticated, DISPATCHER_GATE]

    def post(self, request: Request, pk: Any) -> Response:
        try:
            ticket = resolve_ticket(
                ticket_id=pk,
                user=request.user,
                decision=str(request.data.get("decision", "")),
                reason=str(request.data.get("reason", "")),
                request=request,
            )
        except GrievanceError as exc:
            return _error(exc)
        return Response(_ticket_payload(ticket))


class GrievanceSweepView(APIView):
    """``POST /admin/api/v1/grievances/sweep/`` — the bounded self-heal pass."""

    permission_classes = [IsAuthenticated, SWEEP_GATE]

    def post(self, request: Request) -> Response:
        return Response(sweep(request=request))
