"""Thin domain service layer (BRIEF_M2.md §3: models + a thin service only).

M2 models assignment DATA only (M2-A3: succession workflows come later), so
the layer holds exactly one audited business action: linking an AISHE code
to an institution. Soft verification means an institution WITHOUT an AISHE
code is never blocked — linking is additive, audited and reversible by the
admin (the code itself is replaceable only through an explicit re-link).
"""
from __future__ import annotations

import re
from typing import Any

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from .models import Institution

#: Official-ish AISHE identifier shape (letters/digits/dashes, 4..32 chars).
AISHE_CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9\-]{3,31}$")


def link_aishe_code(
    *,
    institution: Institution,
    aishe_code: str,
    actor: Any = None,
    request: Any = None,
) -> Institution:
    """Link (or confirm) the AISHE code of an institution — audited (P0).

    Rules: strict format, unique across the directory, and a linked code is
    immutable through this call (re-linking a DIFFERENT code is refused —
    that is an explicit, audited admin action of its own).
    """
    value = (aishe_code or "").strip().upper()
    if not AISHE_CODE_RE.match(value):
        raise ValidationError(
            {"aishe_code": "AISHE code must be 4-32 chars of A-Z, 0-9, '-'."}
        )
    if institution.aishe_code and institution.aishe_code != value:
        raise ValidationError(
            {"aishe_code": "Institution already linked to a different AISHE code."}
        )
    with transaction.atomic():
        if institution.aishe_code != value:
            try:
                # Savepoint: a duplicate code must not poison the caller's
                # transaction when we translate it to a ValidationError.
                with transaction.atomic():
                    institution.aishe_code = value
                    institution.save(update_fields=["aishe_code", "updated_at"])
            except IntegrityError as exc:  # duplicate code in the directory
                raise ValidationError(
                    {"aishe_code": "AISHE code already linked to another institution."}
                ) from exc
    _audit(
        "institution.aishe_linked",
        actor=actor,
        request=request,
        object_id=institution.code,
        aishe_code=value,
    )
    return institution


def _audit(
    action: str,
    *,
    actor: Any = None,
    request: Any = None,
    object_id: str = "",
    **detail: Any,
) -> None:
    """One audit row for a domain action (same discipline as accounts.services)."""
    from apps.audit import services as audit_services

    audit_services.record(
        action=action,
        request=request,
        object_type="institution",
        object_id=object_id,
        actor_id=int(actor.pk) if actor is not None else None,
        actor_label=actor.get_username() if actor is not None else "system",
        detail=detail,
    )
