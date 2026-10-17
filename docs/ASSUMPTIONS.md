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

## A6 — DRF default permission is AllowAny in M0
No endpoints exist yet. The central deny-by-default policy layer replaces this
in M1 (explicitly listed as an M1 deliverable).

## A7 — Django 5.2 (LTS line) and DRF 3.16
"Django 5" in the spec is interpreted as the current 5.x LTS series.

## A8 — Accessibility check in CI
The axe check runs against the built frontend (vite preview + @axe-core/cli)
rather than a live deployed environment.

## A9 — Docker stack cannot be verified in this environment
`infra/docker-compose.yml` and the Dockerfiles are written to be correct and
YAML-parseable but were not executed here (no Docker daemon). Validation of
the compose stack is an action item for an environment with Docker.
