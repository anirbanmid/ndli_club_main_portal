"""Audit recording + chain verification (BRIEF_M1.md §5)."""
from __future__ import annotations

import uuid
from typing import Any

from .models import AuditLog, compute_entry_hash


def record(
    *,
    action: str,
    request: Any = None,
    outcome: str = "success",
    object_type: str = "",
    object_id: str = "",
    detail: dict[str, Any] | None = None,
    actor_id: int | None = None,
    actor_label: str = "",
    category: str = "",
    institution_code: str = "",
    zone_code: str = "",
) -> AuditLog:
    """Append exactly one audit row (the ONLY write path into AuditLog)."""
    ip_address = ""
    user_agent = ""
    request_id = ""
    if request is not None:
        meta = getattr(request, "META", {})
        forwarded = str(meta.get("HTTP_X_FORWARDED_FOR", ""))
        ip_address = (
            forwarded.split(",")[0].strip()
            if forwarded
            else str(meta.get("REMOTE_ADDR", ""))
        )
        user_agent = str(meta.get("HTTP_USER_AGENT", ""))[:256]
        request_id = str(getattr(request, "audit_request_id", "")) or uuid.uuid4().hex
        user = getattr(request, "user", None)
        if (
            actor_id is None
            and user is not None
            and getattr(user, "is_authenticated", False)
        ):
            actor_id = int(user.pk)
            actor_label = user.get_username()
            # M2U: the user IS the identity record. Duck-typed on purpose so
            # the audit sink never has to import the accounts models.
            if getattr(user, "category", None) is not None:
                category = category or str(user.category)
                institution_code = institution_code or str(user.institution_code)
                zone_code = zone_code or str(user.zone_code)
        elif actor_id is None:
            actor_label = actor_label or "anonymous"

    row = AuditLog(
        actor_id=actor_id,
        actor_label=actor_label,
        category=category,
        action=action,
        outcome=outcome,
        object_type=object_type,
        object_id=str(object_id),
        institution_code=institution_code,
        zone_code=zone_code,
        request_id=request_id,
        ip_address=ip_address,
        user_agent=user_agent,
        detail=detail or {},
    )
    row.save()
    return row


def verify_chain() -> tuple[bool, int | None]:
    """Walk the chain; (True, None) or (False, first bad seq)."""
    prev = "0" * 64
    for row in AuditLog.objects.order_by("seq"):
        if row.prev_hash != prev:
            return False, int(row.seq)
        if compute_entry_hash(row) != row.entry_hash:
            return False, int(row.seq)
        prev = row.entry_hash
    return True, None
