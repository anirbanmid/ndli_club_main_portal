"""Dual-Layer Security Challenge -- the Layer-1 issue endpoint (0018)."""
from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .security_challenge import DOMAIN_BUSINESS, DOMAIN_SERVER, issue_challenge

_DOMAINS = frozenset({DOMAIN_BUSINESS, DOMAIN_SERVER})


class SecurityChallengeView(APIView):
    """``POST /api/v1/accounts/security-challenge/`` -- mint a challenge.

    Body: the turf the pending action belongs to (AUTH-TURF 2026-10-27:
    NEVER MIX). Returns the challenge token plus the canvas glyph draw
    instructions; the answer lives only in the session and burns on every
    attempt (P0, one-shot).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        body = request.data if isinstance(request.data, dict) else {}
        domain = str(body.get('domain', '')).strip()
        if domain not in _DOMAINS:
            return Response(
                {'error': 'Unknown security domain.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = issue_challenge(request, domain)
        return Response(payload, headers={'Cache-Control': 'no-store, max-age=0'})
