# Assumptions — NDLI Club Main Portal

Per the working rules (spec section 10): when the spec is silent, choose the
simplest secure option, record it here, and continue. Each entry can be
overridden by the project owner.

## A1 — frontend/ is the frozen existing demo app (M0)
The M0 milestone prompt asks for a "React+Vite+TS+Tailwind skeleton with i18n
(en, hi + scaffolded NDLI language list), design tokens, accessible layout
shell". That deliverable already exists from an earlier stage and is copied
into `frontend/` unmodified; its UI/i18n work is intentionally frozen until
the feature milestones. The 24-language i18n resource structure is present
under `frontend/src/i18n/`.

## A2 — Dev defaults to SQLite; prod requires PostgreSQL
`config.settings.dev` uses `DATABASE_URL` when set, otherwise SQLite, so
tests and `manage.py check` run zero-setup. `config.settings.prod` refuses to
start unless `DATABASE_URL` is a PostgreSQL URL.

## A3 — API versioning prefix
The spec requires "the API under /api/". Concrete mount: versioned endpoints
under `/api/v1/`, OpenAPI schema at `/api/schema/`, docs at `/api/docs/`.

## A4 — `make seed` is a wired stub until M2
M0 ships the Makefile target and a `seed_samples` management command that
prints a clear message; real SAMPLE-ONLY seed files and loaders arrive in M2.

## A5 — Health endpoints live in the `core` app
`/health/` (liveness) and `/health/ready/` (readiness, checks DB + cache) are
plain Django views mounted at the URL root, outside the versioned API.

## A6 — DRF default permission is AllowAny in M0 (REPLACED IN M1)
No endpoints existed yet in M0. The central deny-by-default policy layer
(`DenyAll` default) replaced this in M1 — see docs/RBAC.md.

## A7 — Django 5.2 (LTS line) and DRF 3.16
"Django 5" in the spec is interpreted as the current 5.x LTS series.
(M1 ships DRF 3.17.2 — the security-fixed pin from m0fix.)

## A8 — Accessibility check in CI
The axe check runs against the built frontend (vite preview + @axe-core/cli)
rather than a live deployed environment.

## A9 — Docker stack cannot be verified in this environment
`infra/docker-compose.yml` and the Dockerfiles are written to be correct and
YAML-parseable but were not executed here (no Docker daemon). Validation of
the compose stack is an action item for an environment with Docker.

---

## M1 assumptions (BRIEF_M1.md §9 — override any, any time)

- **M1-A1** Scoping keys (`institution_code`, `zone_code`, `club_code`) are plain
  audited fields on the profile in M1; M2 upgrades them to real FKs
  (Zone / State / Institution / Club).
- **M1-A2** Email driver = console in dev/CI; the SendGrid implementation is
  built now but configured later (M10 handover) — `SENDGRID_API_KEY` empty ⇒
  console driver. Checklist: docs/SECURITY.md.
- **M1-A3** M1 ships **API-level identity only** — no login/registration screens
  (wizard + login UI = M3–M4, UI-defer rule). The F1 registration fields
  (mobile + alt phone) exist in the schema now.
- **M1-A4** TOTP via `pyotp` (pinned `2.10.0`).
- **M1-A5** Welcome link validity **72 h**, forgot-password link **30 min**
  (both single-use, purpose-bound).
- **M1-A6** Official Institutional Passkey = **one per club**, generated at club
  onboarding (M2/M4), delivered via an official channel, hashed at rest,
  rotatable; NOT the student campus passkey.
- **M1-A7** Break-glass new password = shown once on screen to the admin, handed
  over MANUALLY (phone / in person — no SMS service exists in the product),
  flagged `must_change_password`.
- **M1-A8** Login id = a **chosen unique username**; the email address is a
  contact/recovery field (welcome + reset links go there) — it is NOT the login id.
- **M1-A9** Student accounts authenticate with password (or campus-passkey at
  join, M4/M5) — **no OTP login for students**; email OTP is reserved for
  verification flows (M4 authority email validation).
- **M1-A10** `AUTH_USER_MODEL` is NOT customized — Django's stock `auth.User`
  plus a `Profile` OneToOne carrying `category` / `sub_role` / the scope keys.
  Functionally equivalent to the brief's "custom User model"; flagged for the
  owner as the one structural deviation from the brief.
- **Note (not an assumption, a guard):** `SMS_BACKEND` remains in settings as a
  future *notifications* adapter slot only. It is NEVER a verification/identity
  channel; T2 asserts no identity path touches it (per the user decision
  2026-10-17 23:13: no SMS/voice delivery anywhere in the product).
- **Note:** M1 ships **initial migrations** for the apps with models
  (`accounts`, `audit`) — the earlier `run_syncdb` approach broke the CI Tests
  job: CI runs **Postgres**, which validates FK targets at DDL time, so
  `auth_user` did not exist yet when the unmigrated app tables were synced
  (SQLite defers FK targets, which is why it passed locally). The remaining M0
  scaffold apps have no models yet; M2 adds their migrations with the domain
  models.

## Milestone 2 (core domain, scoping FKs, seed data)

- **M2-A1** The zone of an institution/club is ALWAYS derived from its state
  (`institution.state.zone`) — never stored on child rows in parallel (P4).
- **M2-A2** Multiple clubs per institution are first-class (spec: "one
  institution can have multiple clubs").
- **M2-A3** Authority tiers are the 4 spec tiers (patron / president /
  secretary / executive). Succession workflows (Dual-Factor Succession Desk,
  Transition Seal) are LATER milestones — M2 models the assignment data only.
- **M2-A4** `data/samples/` is SAMPLE-ONLY; the loader is idempotent, `--reset`
  is bounded to seed rows, `--dry-run` writes nothing, and prod seeding is an
  explicit, flagged, audited action (no destructive automation is scheduled).
- **M2-A5** The Profile scope-key swap to FKs is STATE-ONLY
  (`SeparateDatabaseAndState` with empty `database_operations`): the database
  keeps the exact M1 columns (`*_code varchar(64)`) and their contents, so
  every M1-era row keeps working. The relations carry `db_constraint=False`;
  unresolved soft codes are reported by `manage.py verify_domain` (the P5 heal
  list) and the domain graph wins when both are present. Reversible both ways
  without data loss (actually executed in the D1 pin).
- **Note (schema contract):** every domain code column is
  `CODE_MAX_LENGTH = 64` (apps/domain/models.py — the single source), sized for
  the widest real State/UT code (40 chars). The M2 width pin asserts every
  sample value fits its column: SQLite silently truncates varchar overflows,
  Postgres rejects them (`StringDataRightTruncation`) — the pin exists because
  that divergence bit the seed loader once.
