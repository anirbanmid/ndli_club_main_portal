"""Certificate sample fixtures + loader (BRIEF_M3 §4a, milestone M3).

``data/samples/certificates.json`` is SAMPLE-ONLY fixture data — the owner has
no real certificate data yet (BRIEF_M3 §8: certificates = fixtures). This
loader mirrors the M2 sample loader's discipline:

* **whitelist-only rows** (unknown keys rejected — no mass assignment);
* **typed, conservative validators** (injection-safe identifier shapes);
* **all-or-nothing transaction** (a bad row rolls back everything);
* **bounded ``--reset``** that touches ONLY the fixture rows (P5);
* **explicit, audited** action (P0).

Reuse where rules already have a home (P4 single source): ``SeedResult``,
``SeedValidationError``, ``is_production``, ``CODE_RE`` and ``USERNAME_RE``
come from :mod:`apps.domain.seed`; the id format law comes from
:mod:`apps.certificates.ids`; categories from the model's own choices. The
reader here is deliberately small and local — it validates ONE fixture file.

Signing: fixture certificates are signed through the real issuance path at
load time (the HMAC tag is derived data and never lives in the fixture file —
V3). Revocations are get_or_create only: seeding NEVER deletes or overwrites
a revocation, because revocation is a human action, not fixture state.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction

from apps.certificates import signing
from apps.certificates.ids import is_valid_certificate_id
from apps.certificates.models import Certificate, CertificateCategory, Revocation
from apps.domain.models import Club
from apps.domain.seed import (
    CODE_RE,
    USERNAME_RE,
    SeedResult,
    SeedValidationError,
    is_production,
)

#: The one fixture file (same samples directory as the M2 seed, P4).
CERT_SAMPLES_FILE: Path = (
    Path(settings.BASE_DIR).parent / "data" / "samples" / "certificates.json"
)

#: Longest accepted display text in a fixture row (mirrors model widths).
_NAME_MAX = 200

#: Accepted category labels (single source: the model's own choices).
_CATEGORY_VALUES = frozenset(CertificateCategory.values)


def _v_cert_id(value: Any, where: str) -> str:
    """Fixture ids are literal values — the exact display format is required."""
    if not isinstance(value, str) or not is_valid_certificate_id(value):
        raise SeedValidationError(
            f"{where}: must be a certificate id like NDLI-XXXX-XXXX (no 0/O/1/I)"
        )
    return value


def _v_username(value: Any, where: str) -> str:
    if not isinstance(value, str) or not USERNAME_RE.match(value):
        raise SeedValidationError(f"{where}: invalid username shape")
    return value


def _v_code(value: Any, where: str) -> str:
    if not isinstance(value, str) or not CODE_RE.match(value):
        raise SeedValidationError(f"{where}: invalid code shape")
    return value


def _v_name(value: Any, where: str) -> str:
    if not isinstance(value, str):
        raise SeedValidationError(f"{where}: expected a string")
    text = value.strip()
    if not text or len(text) > _NAME_MAX or any(ord(ch) < 32 for ch in text):
        raise SeedValidationError(f"{where}: empty/too long/control characters")
    return text


def _v_date(value: Any, where: str) -> date:
    if not isinstance(value, str):
        raise SeedValidationError(f"{where}: expected an ISO date string")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise SeedValidationError(f"{where}: not an ISO date (YYYY-MM-DD)") from exc


def _v_bool(value: Any, where: str) -> bool:
    if not isinstance(value, bool):
        raise SeedValidationError(f"{where}: expected true/false")
    return value


def _v_category(value: Any, where: str) -> str:
    if not isinstance(value, str) or value not in _CATEGORY_VALUES:
        raise SeedValidationError(
            f"{where}: category must be one of {sorted(_CATEGORY_VALUES)}"
        )
    return value


@dataclass(frozen=True)
class FieldRule:
    """One whitelisted fixture key: its validator and whether it is required."""

    validate: Callable[[Any, str], Any]
    required: bool = False


#: The full whitelist — anything not listed here is rejected outright.
FIELD_RULES: dict[str, FieldRule] = {
    "certificate_id": FieldRule(_v_cert_id, required=True),
    "username": FieldRule(_v_username, required=True),
    "club": FieldRule(_v_code, required=True),
    "category": FieldRule(_v_category, required=True),
    "event_ref": FieldRule(_v_code, required=True),
    "event_title": FieldRule(_v_name, required=True),
    "event_date": FieldRule(_v_date, required=True),
    "issue_date": FieldRule(_v_date, required=True),
    "revoked": FieldRule(_v_bool),
    "revocation_reason": FieldRule(_v_name),
}


def _read_rows() -> list[dict[str, Any]]:
    """Read + validate every fixture row (nothing is written when this raises)."""
    if not CERT_SAMPLES_FILE.exists():
        raise SeedValidationError(f"missing seed file: {CERT_SAMPLES_FILE}")
    payload = json.loads(CERT_SAMPLES_FILE.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise SeedValidationError(f"{CERT_SAMPLES_FILE.name}: expected a JSON array")
    required = {name for name, rule in FIELD_RULES.items() if rule.required}
    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(payload):
        where = f"{CERT_SAMPLES_FILE.name}[{index}]"
        if not isinstance(raw, dict):
            raise SeedValidationError(f"{where}: expected an object")
        unknown = set(raw) - set(FIELD_RULES)
        if unknown:
            raise SeedValidationError(
                f"{where}: unknown fields {sorted(unknown)} (whitelist only)"
            )
        missing = required - set(raw)
        if missing:
            raise SeedValidationError(f"{where}: missing fields {sorted(missing)}")
        row = {
            key: FIELD_RULES[key].validate(value, f"{where}.{key}")
            for key, value in raw.items()
        }
        if row["certificate_id"] in seen_ids:
            raise SeedValidationError(
                f"{where}: duplicate certificate_id {row['certificate_id']}"
            )
        seen_ids.add(row["certificate_id"])
        rows.append(row)
    return rows


def _reset(result: SeedResult, rows: list[dict[str, Any]]) -> None:
    """Delete ONLY the fixture's own rows (bounded, reverse order)."""
    cert_ids = [row["certificate_id"] for row in rows]
    revoked_count, _ = Revocation.objects.filter(
        certificate__certificate_id__in=cert_ids
    ).delete()
    if revoked_count:
        result.removed["revocations"] = revoked_count
    removed_count, _ = Certificate.objects.filter(certificate_id__in=cert_ids).delete()
    if removed_count:
        result.removed["certificates"] = removed_count


def _audit(result: SeedResult, *, reset: bool) -> None:
    """The fixture load is an explicit, audited action (P0 / M2-A4 pattern)."""
    from apps.audit import services as audit_services

    audit_services.record(
        action="certificates.seed_reset" if reset else "certificates.seed",
        actor_label="seed_loader",
        object_type="seed",
        object_id="data/samples/certificates.json",
        detail={"counts": result.counts, "removed": result.removed},
    )


def load_certificate_samples(
    *,
    reset: bool = False,
    dry_run: bool = False,
    allow_production: bool = False,
) -> SeedResult:
    """Load the certificate fixtures idempotently; returns per-entity counts.

    One transaction, all-or-nothing: a bad row rolls back everything, and
    ``dry_run`` rolls back on purpose. Re-running converges (update_or_create
    on the fixture's literal ``certificate_id``).
    """
    if is_production() and not allow_production:
        raise SeedValidationError(
            "refusing to seed production: pass --allow-production for the "
            "explicit, audited action (M2-A4 / P5)"
        )
    rows = _read_rows()
    result = SeedResult()
    user_model = get_user_model()

    try:
        active_key_id = signing.active_key_id()
    except signing.CertificateSigningError as exc:
        raise SeedValidationError(
            f"signing keyring unavailable — cannot issue fixture certificates: {exc}"
        ) from exc

    with transaction.atomic():
        if reset:
            _reset(result, rows)

        for row in rows:
            holder = user_model.objects.filter(username=row["username"]).first()
            club = Club.objects.filter(code=row["club"]).first()
            if holder is None or club is None:
                raise SeedValidationError(
                    f"{row['certificate_id']}: references unknown user "
                    f"{row['username']!r} or club {row['club']!r} — run "
                    "seed_samples first"
                )
            unsigned = Certificate(
                certificate_id=row["certificate_id"],
                holder=holder,
                club=club,
                event_ref=row["event_ref"],
                event_title=row["event_title"],
                event_date=row["event_date"],
                issue_date=row["issue_date"],
                category=row["category"],
                hmac_key_id=active_key_id,
                hmac_tag="",
            )
            tag = signing.sign(
                signing.canonical_payload_for(unsigned), key_id=active_key_id
            )
            _cert, created = Certificate.objects.update_or_create(
                certificate_id=row["certificate_id"],
                defaults={
                    "holder": holder,
                    "club": club,
                    "event_ref": row["event_ref"],
                    "event_title": row["event_title"],
                    "event_date": row["event_date"],
                    "issue_date": row["issue_date"],
                    "category": row["category"],
                    "hmac_key_id": active_key_id,
                    "hmac_tag": tag,
                },
            )
            result.bump("certificates", "created" if created else "updated")

            if row.get("revoked"):
                _rev, rev_created = Revocation.objects.get_or_create(
                    certificate=_cert,
                    defaults={"reason": row.get("revocation_reason", "revoked")},
                )
                if rev_created:
                    result.bump("revocations", "created")
                else:
                    result.bump("revocations", "updated")

        if dry_run:
            transaction.set_rollback(True)

    if not dry_run:
        _audit(result, reset=reset)
    return result
