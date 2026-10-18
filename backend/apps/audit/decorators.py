"""``@audit_action`` decorator + DRF ``AuditMixin`` (BRIEF_M1.md §5).

Every mutating endpoint is decorated and therefore writes exactly one audit
row per call (success or failure). Views attach rich context by writing to
``request.audit_detail`` while they run; the decorator picks it up into the
row's ``detail``.
"""
from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from typing import Any

from . import services


def set_audit_detail(request: Any, **kwargs: Any) -> None:
    """Merge ``kwargs`` into the detail of the row the decorator will write.

    A ``None`` request (service-level calls with no HTTP context) is a
    harmless no-op: there is no row to enrich.
    """
    if request is None:
        return
    detail = getattr(request, "audit_detail", None)
    if detail is None:
        detail = {}
        request.audit_detail = detail
    detail.update(kwargs)


def set_audit_object(request: Any, object_type: str, object_id: Any) -> None:
    """Record which object this request acts on (for the audit row)."""
    if request is None:
        return
    request.audit_object_type = object_type
    request.audit_object_id = str(object_id)


def audit_action(action: str, *, object_type: str = "") -> Callable:
    """Decorate a view function/method; appends one audit row per call."""

    def decorator(view_func: Callable) -> Callable:
        @wraps(view_func)
        def wrapper(request: Any, *args: Any, **kwargs: Any) -> Any:
            request.audit_detail = {}
            response = None
            raised: Exception | None = None
            try:
                response = view_func(request, *args, **kwargs)
                return response
            except Exception as exc:  # noqa: BLE001 - audited then re-raised
                raised = exc
                raise
            finally:
                outcome = "error"
                if raised is None and response is not None:
                    status = int(getattr(response, "status_code", 500))
                    if status < 400:
                        outcome = "success"
                    elif status in (401, 403):
                        outcome = "denied"
                    else:
                        outcome = "failure"
                services.record(
                    action=action,
                    request=request,
                    outcome=outcome,
                    object_type=getattr(request, "audit_object_type", "")
                    or object_type,
                    object_id=getattr(request, "audit_object_id", ""),
                    detail=dict(getattr(request, "audit_detail", {}) or {}),
                )

        return wrapper

    return decorator


class AuditMixin:
    """DRF helper for extra, granular audit rows (e.g. lockout events)."""

    def audit_event(
        self,
        request: Any,
        action: str,
        *,
        outcome: str = "success",
        object_type: str = "",
        object_id: Any = "",
        detail: dict[str, Any] | None = None,
    ) -> None:
        services.record(
            action=action,
            request=request,
            outcome=outcome,
            object_type=object_type,
            object_id=str(object_id),
            detail=detail or {},
        )
