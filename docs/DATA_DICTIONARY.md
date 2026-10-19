# Data Dictionary — NDLI Club Main Portal

**Status: M2.** The core domain schema (Zone, State/UT, District,
Institution, Club, Membership, AuthorityAssignment, OfficerAssignment) plus
the M1 identity/audit tables and the scope-FK swap. Authoritative source =
the Django models (`backend/apps/*/models.py`); this file documents the
contract and the index plan. Timestamps are UTC (displayed IST); ids are
`BigAutoField` unless noted.

Legend: **PK** primary key · **U** unique · **FK** foreign key · **NN**
not null · `→` references.

---

## Domain app (`apps.domain`) — milestone M2

### `domain_zone` — Zone
| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | bigint | PK | |
| code | varchar(64) | U, NN | NORTH · CENTRAL · WEST · EAST · NORTH_EAST · SOUTH (sample seed; admin-editable) |
| name | varchar(64) | NN | Display name |
| is_active | bool | NN | Soft disable |
| created_at / updated_at | timestamptz | NN | |

The zone of an institution/club is ALWAYS derived
(`institution.state.zone`, P4) — never stored on child rows.

### `domain_state` — State / UT (36 rows in the sample seed)
| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | bigint | PK | |
| code | varchar(64) | U, NN | e.g. UTTAR_PRADESH, DELHI |
| name | varchar(64) | NN | |
| zone_id | bigint | FK → domain_zone.id, NN, PROTECT | zone membership |
| kind | varchar(8) | NN | `state` \| `ut` |

### `domain_district` — District (sample master)
| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | bigint | PK | |
| state_id | bigint | FK → domain_state.id, NN, CASCADE | |
| code | varchar(64) | NN | U per state (`district_state_code_uniq`) |
| name | varchar(128) | NN | |

Index: `district_state_name_idx` (state, name).

### `domain_institution` — Institution directory
| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | bigint | PK | |
| code | varchar(64) | U, NN | stable public identifier (the scope key) |
| legacy_id | varchar(64) | U, NN, **immutable** | migration/history anchor; enforced in `save()` + admin readonly |
| aishe_code | varchar(32) | U, **nullable** | SOFT verification — AISHE-less institutions are never blocked |
| name | varchar(255) | NN | |
| state_id | bigint | FK → domain_state.id, NN, PROTECT | |
| district_id | bigint | FK → domain_district.id, nullable, PROTECT | |
| status | varchar(16) | NN | active · pending · closed |
| created_at / updated_at | timestamptz | NN | |

Derived (never stored): `institution.zone` = `state.zone`; `aishe_verified`
= `aishe_code is not None`. Index: `institution_directory_idx`
(state, district, name) — the directory query pattern.

### `domain_club` — Club (M2-A2: many clubs per institution)
| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | bigint | PK | |
| code | varchar(64) | U, NN | scope key |
| institution_id | bigint | FK → domain_institution.id, NN, PROTECT | |
| name | varchar(255) | NN | |
| status | varchar(16) | NN | active · dormant · closed |

Index: `club_institution_idx` (institution). Derived: `club.zone`.

### `domain_membership` — Membership (relational only, never free text)
| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | bigint | PK | |
| user_id | bigint | FK → auth_user.id, NN, CASCADE | |
| club_id | bigint | FK → domain_club.id, NN, PROTECT | |
| role | varchar(16) | NN | member · volunteer · core_team |
| joined_on | date | NN | |
| status | varchar(16) | NN | active · alumni · suspended |

U (`membership_user_club_uniq`): one row per (user, club). Index:
`membership_club_status_idx` (club, status) — the roster query pattern.

### `domain_authorityassignment` — club authority tiers (M2-A3: data only)
| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | bigint | PK | |
| user_id | bigint | FK → auth_user.id, NN, CASCADE | |
| club_id | bigint | FK → domain_club.id, NN, PROTECT | |
| tier | varchar(16) | NN | patron · president · secretary · executive |
| from_date | date | NN | window start |
| to_date | date | nullable | empty = open-ended |
| status | varchar(16) | NN | active · ended · revoked |

Indexes: `authority_club_tier_from_idx` (club, tier, from_date),
`authority_user_idx` (user). Overlapping windows are reported by
`manage.py verify_domain` (dates cannot be constrained portably).

### `domain_officerassignment` — State/UT → officer (routing source)
| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | bigint | PK | |
| state_id | bigint | FK → domain_state.id, NN, PROTECT | |
| officer_id | bigint | FK → auth_user.id, NN, CASCADE | |
| from_date | date | NN | window start |
| to_date | date | nullable | empty = open-ended |

U (`officer_state_officer_from_uniq`): (state, officer, from_date) — the
seed natural key. Index: `officer_state_from_idx` (state, from_date).
`accounts.routing.responsible_officer()` reads ONLY this table (P4).

---

## Accounts app (`apps.accounts`) — M1 + the M2 scope swap

### `accounts_profile` — identity & scope
| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | bigint | PK | |
| user_id | bigint | FK → auth_user.id, U, CASCADE | OneToOne (`profile`) |
| category / sub_role | varchar(32) | NN | RBAC matrix (docs/RBAC.md) |
| institution_code | varchar(64) | NN, default '' | **soft FK → domain_institution.code** (M2) |
| club_code | varchar(64) | NN, default '' | **soft FK → domain_club.code** (M2) |
| zone_code | varchar(64) | NN, default '' | **soft FK → domain_zone.code** (M2) |
| state_code | varchar(64) | NN, default '' | **soft FK → domain_state.code** (M2) |
| phone / alt_phone | varchar(32) | NN | contact-only records (F5 handover) |
| account_state | varchar(32) | NN | pending_approval · active · locked · dormant |
| must_change_password | bool | NN | F2/F5 flow |
| totp_secret_encrypted / totp_enabled / totp_last_counter | text / bool / bigint | | staff MFA |
| failed_login_count / locked_until | int / timestamptz | | lockout |
| created_at / updated_at | timestamptz | NN | |

**The four scope columns kept their M1 names and code-string values** — the
M2 relations are declared as `to_field="code"` foreign keys with
`db_constraint=False` (M2-A5: existing rows keep working; the migration is
state-only + one new index, reversible both ways). Django-level `PROTECT`
still guards deletions; `manage.py verify_domain` reports codes no domain
row answers for; when both are present the domain graph wins
(`apps.domain.assignments`, P4). Compat properties
`institution_code/club_code/zone_code/state_code` preserve the M1 Python
surface exactly.

Indexes: (category, sub_role) · institution_code · club_code · zone_code ·
state_code.

### Other accounts tables (unchanged in M2)
`accounts_emailotp` (hashed single-use OTP), `accounts_emaillinktoken`
(hashed single-use F2/F4 links), `accounts_clubpasskey` (one hashed
Official Institutional Passkey per club code — `club_code` is a plain key
here by design; `verify_domain` reports passkeys without clubs),
`accounts_totprecoverycode`. See BRIEF_M1.md §2.

## Audit app (`apps.audit`) — append-only, hash-chained (P5)
`audit_auditlog` keeps `institution_code` / `zone_code` as **string
snapshots** (M2-A6): a forensic trail must record what was true AT THE
TIME; normalising it into FKs would let history drift with the directory.
Rows are immutable, hash-chained (`prev_hash`/`entry_hash`), and the only
write path is `apps.audit.services.record`.

---

## Index plan (query patterns → indexes, P2)

| Pattern | Index |
| --- | --- |
| Institution directory (state + district + name) | `institution_directory_idx` |
| Club lookup by code | unique on `domain_club.code` |
| Membership roster (club + status) | `membership_club_status_idx` |
| Membership pair lookup (user + club) | `membership_user_club_uniq` |
| Authority by club/tier window | `authority_club_tier_from_idx` |
| Officer routing (state + window) | `officer_state_from_idx` |
| Profile scoping by each key | `accounts_pr_*_idx` on the 4 code columns |
| RBAC matrix walk (category + sub_role) | `accounts_pr_categor_19e31f_idx` |

List reads go through `apps.domain.queries` (bounded page size
`MAX_PAGE_SIZE = 100`, `select_related` chains, query-count pins in
`tests/test_m2_d5_capacity.py`).
