# Architecture — NDLI Club Main Portal

Status: milestone M0 (repository skeleton). This is a short overview, not the
final architecture document (that ships in M10).

## What the product is

The NDLI Club Main Portal (National Digital Library of India, operated from
IIT Kharagpur under the Ministry of Education) replaces the legacy portal at
club.ndl.iitkgp.ac.in. Three branches share one codebase:

1. **Public common landing** (no login) — national telemetry, institutional
   directory, public certificate verifier, GIGW 3.0 accessibility,
   bilingual-first i18n.
2. **Institutional club module** (club authorities + student members) —
   onboarding wizard, club showcase, roster, activities, scholar workspace,
   analytics and NAAC exports.
3. **IIT Kharagpur central administration** (staff only) — seven-zone regional
   governance, charter verification, grievance/SLA dispatch, migration and
   quarantine desk.

## Monorepo layout

```
backend/    Django project (package `config`) + modular apps
frontend/   React + Vite + TypeScript + Tailwind SPA (frozen UI/i18n work)
infra/      docker-compose stack + nginx reverse proxy config
docs/       architecture, RBAC, security, data dictionary, assumptions
scripts/    dev bootstrap helpers
data/samples/  SAMPLE-ONLY seed data (real seeds arrive in M2)
```

## Backend

- Python 3.12, Django 5.2, Django REST Framework, drf-spectacular (OpenAPI at
  `/api/schema/`, interactive docs at `/api/docs/`).
- Settings split: `config.settings.base` (shared, env-driven),
  `config.settings.dev` (SQLite fallback when `DATABASE_URL` is unset —
  zero-setup tests), `config.settings.prod` (requires a PostgreSQL
  `DATABASE_URL`, refuses to start otherwise).
- One Django app per bounded context (spec section 2): `accounts`,
  `institutions`, `clubs`, `members`, `activities`, `certificates`,
  `analytics_reports`, `sharing`, `succession`, `governance`, `grievances`,
  `notifications`, `audit`, `migration_salvage`, `public_api`, `core`.
  In M0 every app is empty but wired (registered, importable, mounted under
  `/api/v1/<context>/` where it exposes an API).
- Health probes: `/health/` (liveness) and `/health/ready/` (readiness —
  checks database and cache).
- Celery (`config.celery`) for async work; Redis broker; MinIO/S3 for private
  object storage (signed URLs only).

## Frontend

React 19 + TypeScript + Vite + Tailwind. The UI and i18n resource structure
(English, Hindi and the scaffolded NDLI language list) were delivered in an
earlier stage and are intentionally frozen until the feature milestones.
Served by nginx in the compose stack; `npm run dev` for local development on
http://localhost:5173.

## Infrastructure

`infra/docker-compose.yml` runs postgres, redis, minio, backend (gunicorn),
celery worker, frontend and an edge nginx (single origin; API under `/api/`).
`infra/nginx.conf` is the reverse-proxy contract.

## Security posture (M0 baseline)

Cookie-based sessions (httpOnly, SameSite=Lax), CSRF on state-changing
requests, no secrets in repo (`.env.example` documents every variable), no
credentials in URLs. The full deny-by-default RBAC layer, OTP, CSP/HSTS
hardening and audit logging arrive in M1 — see docs/SECURITY.md and
docs/RBAC.md.

## Evidence discipline

Claims about the legacy system are labelled `[MEASURED]` or `[TO CONFIRM]`
(see the build spec and SURVEY.md). No national-scale figures are printed in
product UI copy.
