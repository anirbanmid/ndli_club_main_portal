"""SAMPLE-ONLY seed loader (BRIEF_M2.md §2c, M2-A4, P5).

Reads the validated JSON files under ``data/samples/`` and applies them
IDEMPOTENTLY (``update_or_create`` on documented natural keys — re-running
``make seed`` never duplicates a row). Safety rules, all test-pinned:

* every row passes a strict whitelist of fields and value shapes — a seed
  file can never smuggle ORM lookups, extra fields or oversized values
  (mass-assignment / injection guard, P0);
* the loader never touches rows outside the seed's natural keys;
* ``--reset`` is bounded (only seed-natural-key rows, reverse dependency
  order) and REFUSED in production without ``--allow-production``;
* seeding is an explicit, flagged, audited action in production (M2-A4);
* sample accounts get UNUSABLE passwords — the seed never ships credentials.
"""
from __future__ import annotations

import json
import re
from collections.abc import Callable, Collection
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Model

from apps.accounts.models import (
    ACCOUNT_STATE_CHOICES,
    CATEGORY_CHOICES,
    SUB_ROLE_CHOICES,
)

from .models import (
    AuthorityAssignment,
    Club,
    District,
    Institution,
    Membership,
    OfficerAssignment,
    State,
    Zone,
)

#: SAMPLE-ONLY data lives here (never authoritative — data/samples/README.md).
SAMPLES_DIR = Path(settings.BASE_DIR).parent / "data" / "samples"

#: Conservative identifier shape: uppercase codes only, no ORM/SQL metachars.
CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9_\-]{0,63}$")
#: Django-compatible usernames (the seed never invents exotic account names).
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,150}$")

CATEGORY_VALUES = {value for value, _label in CATEGORY_CHOICES}
SUB_ROLE_VALUES = {value for value, _label in SUB_ROLE_CHOICES}
ACCOUNT_STATE_VALUES = {value for value, _label in ACCOUNT_STATE_CHOICES}


class SeedValidationError(ValidationError):
    """A seed row failed validation (nothing is written when this raises)."""


@dataclass
class SeedResult:
    """Created/updated row counts per entity + the reset log."""

    counts: dict[str, dict[str, int]] = field(default_factory=dict)
    removed: dict[str, int] = field(default_factory=dict)

    def bump(self, entity: str, kind: str) -> None:
        bucket = self.counts.setdefault(entity, {"created": 0, "updated": 0})
        bucket[kind] += 1

    def total(self) -> int:
        return sum(sum(bucket.values()) for bucket in self.counts.values())


# --- row validation (strict whitelist; P0 injection/mass-assignment guard) --

def _v_code(value: Any, where: str) -> str:
    if not isinstance(value, str) or not CODE_RE.match(value):
        raise SeedValidationError(f"{where}: invalid code {value!r}")
    if "__" in value:
        # Defence in depth: never let a value that looks like an ORM lookup
        # path anywhere near the loader (P0 injection guard).
        raise SeedValidationError(f"{where}: lookup-like code {value!r}")
    return value


def _v_name(value: Any, where: str) -> str:
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 255:
        raise SeedValidationError(f"{where}: invalid name {value!r}")
    if any(ord(char) < 32 for char in value):
        raise SeedValidationError(f"{where}: control characters in name")
    return value.strip()


def _v_username(value: Any, where: str) -> str:
    if not isinstance(value, str) or not USERNAME_RE.match(value):
        raise SeedValidationError(f"{where}: invalid username {value!r}")
    return value


def _v_email(value: Any, where: str) -> str:
    if not isinstance(value, str) or "@" not in value or len(value) > 254:
        raise SeedValidationError(f"{where}: invalid email {value!r}")
    return value


def _v_date(value: Any, where: str) -> date:
    if not isinstance(value, str):
        raise SeedValidationError(f"{where}: date must be YYYY-MM-DD, got {value!r}")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise SeedValidationError(f"{where}: bad date {value!r}") from exc


def _v_choice(options: Collection[Any]) -> Callable[[Any, str], str]:
    def validate(value: Any, where: str) -> str:
        if not isinstance(value, str) or value not in options:
            raise SeedValidationError(f"{where}: {value!r} not in {sorted(options)}")
        return value

    return validate


def _v_bool(value: Any, where: str) -> bool:
    if not isinstance(value, bool):
        raise SeedValidationError(f"{where}: expected boolean, got {value!r}")
    return value


def _v_optional(inner: Callable[[Any, str], Any]) -> Callable[[Any, str], Any]:
    def validate(value: Any, where: str) -> Any:
        if value is None or value == "":
            return None
        return inner(value, where)

    return validate


@dataclass(frozen=True)
class FileSpec:
    """Whitelist for one seed file: allowed keys, validators, natural key."""

    name: str
    fields: dict[str, Callable[[Any, str], Any]]
    required: frozenset[str]
    natural_key: tuple[str, ...]


SPECIES: tuple[FileSpec, ...] = (
    FileSpec(
        name="zones.json",
        fields={
            "code": _v_code,
            "name": _v_name,
            "is_active": _v_bool,
        },
        required=frozenset({"code", "name"}),
        natural_key=("code",),
    ),
    FileSpec(
        name="states.json",
        fields={
            "code": _v_code,
            "name": _v_name,
            "zone": _v_code,
            "kind": _v_choice({"state", "ut"}),
        },
        required=frozenset({"code", "name", "zone"}),
        natural_key=("code",),
    ),
    FileSpec(
        name="districts.json",
        fields={
            "state": _v_code,
            "code": _v_code,
            "name": _v_name,
        },
        required=frozenset({"state", "code", "name"}),
        natural_key=("state", "code"),
    ),
    FileSpec(
        name="institutions.json",
        fields={
            "code": _v_code,
            "legacy_id": _v_code,
            "name": _v_name,
            "state": _v_code,
            "district": _v_optional(_v_code),
            "aishe_code": _v_optional(_v_code),
            "status": _v_choice({"active", "pending", "closed"}),
        },
        required=frozenset({"code", "legacy_id", "name", "state"}),
        natural_key=("code",),
    ),
    FileSpec(
        name="clubs.json",
        fields={
            "code": _v_code,
            "institution": _v_code,
            "name": _v_name,
            "status": _v_choice({"active", "dormant", "closed"}),
        },
        required=frozenset({"code", "institution", "name"}),
        natural_key=("code",),
    ),
    FileSpec(
        name="users.json",
        fields={
            "username": _v_username,
            "email": _v_email,
            "category": _v_choice(CATEGORY_VALUES),
            "sub_role": _v_choice(SUB_ROLE_VALUES),
            "account_state": _v_choice(ACCOUNT_STATE_VALUES),
            "is_staff": _v_bool,
            "institution": _v_optional(_v_code),
            "club": _v_optional(_v_code),
            "state": _v_optional(_v_code),
            "zone": _v_optional(_v_code),
        },
        required=frozenset({"username", "email", "category", "sub_role"}),
        natural_key=("username",),
    ),
    FileSpec(
        name="memberships.json",
        fields={
            "username": _v_username,
            "club": _v_code,
            "role": _v_choice({"member", "volunteer", "core_team"}),
            "joined_on": _v_date,
            "status": _v_choice({"active", "alumni", "suspended"}),
        },
        required=frozenset({"username", "club"}),
        natural_key=("username", "club"),
    ),
    FileSpec(
        name="authority_assignments.json",
        fields={
            "username": _v_username,
            "club": _v_code,
            "tier": _v_choice({"patron", "president", "secretary", "executive"}),
            "from_date": _v_date,
            "to_date": _v_optional(_v_date),
            "status": _v_choice({"active", "ended", "revoked"}),
        },
        required=frozenset({"username", "club", "tier", "from_date"}),
        natural_key=("username", "club", "tier", "from_date"),
    ),
    FileSpec(
        name="officer_assignments.json",
        fields={
            "state": _v_code,
            "username": _v_username,
            "from_date": _v_date,
            "to_date": _v_optional(_v_date),
        },
        required=frozenset({"state", "username", "from_date"}),
        natural_key=("state", "username", "from_date"),
    ),
)


def is_production() -> bool:
    """True when this process runs against the production configuration."""
    import os

    return os.environ.get("DJANGO_ENV", "").strip().lower() in {"prod", "production"}


def _read_rows(spec: FileSpec) -> list[dict[str, Any]]:
    path = SAMPLES_DIR / spec.name
    if not path.exists():
        raise SeedValidationError(f"missing seed file: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise SeedValidationError(f"{spec.name}: expected a JSON array")
    rows: list[dict[str, Any]] = []
    for index, raw in enumerate(payload):
        where = f"{spec.name}[{index}]"
        if not isinstance(raw, dict):
            raise SeedValidationError(f"{where}: expected an object")
        unknown = set(raw) - set(spec.fields)
        if unknown:
            raise SeedValidationError(
                f"{where}: unknown fields {sorted(unknown)} (whitelist only)"
            )
        missing = spec.required - set(raw)
        if missing:
            raise SeedValidationError(f"{where}: missing fields {sorted(missing)}")
        rows.append(
            {
                key: spec.fields[key](value, f"{where}.{key}")
                for key, value in raw.items()
            }
        )
    return rows


def _natural(row: dict[str, Any], spec: FileSpec) -> dict[str, Any]:
    return {key: row[key] for key in spec.natural_key}


def _pair_filter(pairs: list[tuple[Any, ...]], names: tuple[str, str]) -> Any:
    """OR-combine exact (a, b) pair lookups — bounded, never cartesian."""
    from django.db.models import Q

    combined = Q(pk__in=[])
    for first, second in pairs:
        combined |= Q(**{names[0]: first, names[1]: second})
    return combined


def _reset(result: SeedResult, rows: dict[str, list[dict[str, Any]]]) -> None:
    """Delete ONLY the seed's own rows, reverse dependency order (bounded)."""
    user_model = get_user_model()
    usernames = [row["username"] for row in rows.get("users.json", [])]
    club_codes = [row["code"] for row in rows.get("clubs.json", [])]
    state_codes = [row["code"] for row in rows.get("states.json", [])]
    institution_codes = [row["code"] for row in rows.get("institutions.json", [])]
    zone_codes = [row["code"] for row in rows.get("zones.json", [])]

    def drop(model: type[Model], label: str, queryset: Any) -> None:
        count, _per_model = queryset.delete()
        result.removed[label] = result.removed.get(label, 0) + count

    membership_pairs = [
        (row["username"], row["club"]) for row in rows.get("memberships.json", [])
    ]
    drop(
        Membership,
        "memberships",
        Membership.objects.filter(
            _pair_filter(membership_pairs, ("user__username", "club__code"))
        ),
    )
    authority_pairs = [
        (row["username"], row["club"])
        for row in rows.get("authority_assignments.json", [])
    ]
    drop(
        AuthorityAssignment,
        "authority_assignments",
        AuthorityAssignment.objects.filter(
            _pair_filter(authority_pairs, ("user__username", "club__code"))
        ),
    )
    officer_pairs = [
        (row["username"], row["state"])
        for row in rows.get("officer_assignments.json", [])
    ]
    drop(
        OfficerAssignment,
        "officer_assignments",
        OfficerAssignment.objects.filter(
            _pair_filter(officer_pairs, ("officer__username", "state__code"))
        ),
    )
    # M2U: there is no separate profile table to drop — the identity rows
    # ARE the user rows (bounded to the seed usernames, as before).
    drop(user_model, "users", user_model.objects.filter(username__in=usernames))
    drop(Club, "clubs", Club.objects.filter(code__in=club_codes))
    drop(
        Institution,
        "institutions",
        Institution.objects.filter(code__in=institution_codes),
    )
    district_pairs = [
        (row["state"], row["code"]) for row in rows.get("districts.json", [])
    ]
    drop(
        District,
        "districts",
        District.objects.filter(
            _pair_filter(district_pairs, ("state__code", "code"))
        ),
    )
    drop(State, "states", State.objects.filter(code__in=state_codes))
    drop(Zone, "zones", Zone.objects.filter(code__in=zone_codes))


def load_samples(
    *,
    reset: bool = False,
    dry_run: bool = False,
    allow_production: bool = False,
) -> SeedResult:
    """Apply every seed file idempotently; returns per-entity counts.

    The whole load runs in ONE transaction: a bad row rolls back everything
    (all-or-nothing), and ``dry_run`` rolls back on purpose.
    """
    if is_production() and not allow_production:
        raise SeedValidationError(
            "refusing to seed production: pass --allow-production for the "
            "explicit, audited action (M2-A4 / P5)"
        )
    rows = {spec.name: _read_rows(spec) for spec in SPECIES}
    result = SeedResult()
    user_model = get_user_model()

    with transaction.atomic():
        if reset:
            _reset(result, rows)

        zones = {row["code"]: row for row in rows["zones.json"]}
        zone_objects = {}
        for row in rows["zones.json"]:
            obj, created = Zone.objects.update_or_create(
                code=row["code"],
                defaults={"name": row["name"], "is_active": row.get("is_active", True)},
            )
            zone_objects[row["code"]] = obj
            result.bump("zones", "created" if created else "updated")

        for row in rows["states.json"]:
            if row["zone"] not in zones:
                raise SeedValidationError(
                    f"states.json: {row['code']} references unknown zone "
                    f"{row['zone']!r}"
                )
            _state_obj, created = State.objects.update_or_create(
                code=row["code"],
                defaults={
                    "name": row["name"],
                    "zone": zone_objects[row["zone"]],
                    "kind": row.get("kind", "state"),
                },
            )
            result.bump("states", "created" if created else "updated")

        for row in rows["districts.json"]:
            state = State.objects.filter(code=row["state"]).first()
            if state is None:
                raise SeedValidationError(
                    f"districts.json: {row['code']} references unknown state "
                    f"{row['state']!r}"
                )
            _district_obj, created = District.objects.update_or_create(
                state=state,
                code=row["code"],
                defaults={"name": row["name"]},
            )
            result.bump("districts", "created" if created else "updated")

        for row in rows["institutions.json"]:
            state = State.objects.filter(code=row["state"]).first()
            if state is None:
                raise SeedValidationError(
                    f"institutions.json: {row['code']} references unknown state "
                    f"{row['state']!r}"
                )
            defaults: dict[str, Any] = {
                "legacy_id": row["legacy_id"],
                "name": row["name"],
                "state": state,
                "status": row.get("status", "active"),
                "aishe_code": row.get("aishe_code"),
            }
            if row.get("district"):
                district = District.objects.filter(
                    state=state, code=row["district"]
                ).first()
                if district is None:
                    raise SeedValidationError(
                        f"institutions.json: {row['code']} references unknown "
                        f"district {row['district']!r}"
                    )
                defaults["district"] = district
            else:
                defaults["district"] = None
            _institution_obj, created = Institution.objects.update_or_create(
                code=row["code"], defaults=defaults
            )
            result.bump("institutions", "created" if created else "updated")

        for row in rows["clubs.json"]:
            institution = Institution.objects.filter(
                code=row["institution"]
            ).first()
            if institution is None:
                raise SeedValidationError(
                    f"clubs.json: {row['code']} references unknown institution "
                    f"{row['institution']!r}"
                )
            _club_obj, created = Club.objects.update_or_create(
                code=row["code"],
                defaults={
                    "institution": institution,
                    "name": row["name"],
                    "status": row.get("status", "active"),
                },
            )
            result.bump("clubs", "created" if created else "updated")

        for row in rows["users.json"]:
            # M2U: identity + profile are ONE record, so the profile columns
            # are created/updated on the user row itself (P4 — no parallel
            # copy to drift).
            profile_defaults = {
                "category": row["category"],
                "sub_role": row["sub_role"],
                "account_state": row.get("account_state", "active"),
                "institution_id": row.get("institution") or "",
                "club_id": row.get("club") or "",
                "state_id": row.get("state") or "",
                "zone_id": row.get("zone") or "",
            }
            user, created = user_model.objects.get_or_create(
                username=row["username"],
                defaults={
                    "email": row["email"],
                    "is_staff": row.get("is_staff", False),
                    **profile_defaults,
                },
            )
            if created:
                # SAMPLE accounts never carry usable credentials (P0).
                user.set_unusable_password()
                user.save(update_fields=["password"])
            else:
                for field, value in profile_defaults.items():
                    setattr(user, field, value)
                user.save(
                    update_fields=[*profile_defaults, "updated_at"]
                )
            result.bump("users", "created" if created else "updated")

        for row in rows["memberships.json"]:
            member_user = user_model.objects.filter(username=row["username"]).first()
            club = Club.objects.filter(code=row["club"]).first()
            if member_user is None or club is None:
                raise SeedValidationError(
                    f"memberships.json: {row['username']}@{row['club']} "
                    "references unknown user or club"
                )
            _membership_obj, created = Membership.objects.update_or_create(
                user=member_user,
                club=club,
                defaults={
                    "role": row.get("role", "member"),
                    "joined_on": row.get("joined_on", date.today()),
                    "status": row.get("status", "active"),
                },
            )
            result.bump("memberships", "created" if created else "updated")

        for row in rows["authority_assignments.json"]:
            authority_user = user_model.objects.filter(
                username=row["username"]
            ).first()
            club = Club.objects.filter(code=row["club"]).first()
            if authority_user is None or club is None:
                raise SeedValidationError(
                    f"authority_assignments.json: {row['username']}@{row['club']} "
                    "references unknown user or club"
                )
            _authority_obj, created = AuthorityAssignment.objects.update_or_create(
                user=authority_user,
                club=club,
                tier=row["tier"],
                from_date=row["from_date"],
                defaults={
                    "to_date": row.get("to_date"),
                    "status": row.get("status", "active"),
                },
            )
            result.bump(
                "authority_assignments", "created" if created else "updated"
            )

        for row in rows["officer_assignments.json"]:
            officer_user = user_model.objects.filter(username=row["username"]).first()
            state = State.objects.filter(code=row["state"]).first()
            if officer_user is None or state is None:
                raise SeedValidationError(
                    f"officer_assignments.json: {row['state']}->{row['username']} "
                    "references unknown user or state"
                )
            _officer_obj, created = OfficerAssignment.objects.update_or_create(
                state=state,
                officer=officer_user,
                from_date=row["from_date"],
                defaults={"to_date": row.get("to_date")},
            )
            result.bump(
                "officer_assignments", "created" if created else "updated"
            )

        if dry_run:
            transaction.set_rollback(True)

    if not dry_run:
        _audit(result, reset=reset)
    return result


def _audit(result: SeedResult, *, reset: bool) -> None:
    """The seed is an explicit, audited action (M2-A4 / P0)."""
    from apps.audit import services as audit_services

    audit_services.record(
        action="domain.seed_reset" if reset else "domain.seed",
        actor_label="seed_loader",
        object_type="seed",
        object_id="data/samples",
        detail={"counts": result.counts, "removed": result.removed},
    )
