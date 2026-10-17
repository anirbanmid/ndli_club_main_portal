# Data Dictionary — NDLI Club Main Portal

**Status: STUB. The data dictionary is delivered in milestone M2** together
with the core domain models (Zone, State, District, Institution, Club,
Authority, User, Membership) and their migrations. This placeholder exists
from M0 as required by the project documentation set.

## Planned content (M2 onward)

- Model-by-model field reference (type, nullability, indexes, constraints).
- Legacy mapping: every migrated legacy row keeps its original id in an
  immutable, indexed `legacy_id` column; `apaar_id` is nullable and unique
  where present.
- Timestamps are stored in UTC and displayed in IST.
- Index plan for every filter used by the directory, roster and reports.
- Certificate records: `cert_id`, `hmac`, `key_id`, `legacy_hash`, `revoked`,
  `nad_status` (gated).

## Where the schema lives

Until M2, the authoritative schema is the Django code itself
(`backend/apps/*/models.py` — intentionally empty in M0).
