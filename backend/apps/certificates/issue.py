"""The ONE certificate issuer (M6 D5, P4 single source).

Registration (D2b) and renewal (D5) certificates are both minted through
``issue_certificate`` — collision-safe id generation + HMAC signing included.
There is no second cert path anywhere in the portal.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from django.db import IntegrityError, transaction

from . import signing
from .ids import format_certificate_id, generate_unique_certificate_id
from .models import Certificate, CertificateCategory


def issue_certificate(
    *,
    holder: Any,
    club: Any,
    category: CertificateCategory | str,
    event_ref: str,
    event_title: str,
    event_date: date,
    issue_date: date,
) -> Certificate:
    """Mint + sign one certificate (retry-on-collision, never double-rows)."""
    captured: dict[str, Certificate] = {}

    def _save_callable(body: str) -> str:
        # Savepoint per attempt: a duplicate id rolls back to HERE only, and
        # the generator retries (the unique constraint is the backstop).
        try:
            with transaction.atomic():
                cert = Certificate(
                    certificate_id=format_certificate_id(body),
                    hmac_key_id="",
                    hmac_tag="",
                    holder=holder,
                    club=club,
                    event_ref=event_ref[:64],
                    event_title=event_title[:200],
                    event_date=event_date,
                    category=category,
                    issue_date=issue_date,
                )
                cert.hmac_key_id = signing.active_key_id()
                cert.hmac_tag = signing.sign_certificate(cert)
                cert.save()
                captured["cert"] = cert
                return cert.certificate_id
        except IntegrityError:
            raise

    generate_unique_certificate_id(_save_callable)
    return captured["cert"]
