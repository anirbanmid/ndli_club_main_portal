# NDLI Club Main Portal

Modular monorepo for the NDLI Club Main Portal — the National Digital Library
of India club platform (NDLI, IIT Kharagpur, Ministry of Education), replacing
the legacy portal at club.ndl.iitkgp.ac.in.

**Status: milestone M0 (repository, tooling, skeleton).** Feature work arrives
in later milestones; see `ndli_main_portal/BUILD_PROMPT_v2.md` for the plan.

## Layout

```
backend/       Django 5 project (package `config`) + modular apps (DRF, drf-spectacular)
frontend/      React + Vite + TypeScript + Tailwind SPA (i18n: en, hi + scaffolded NDLI languages)
infra/         docker-compose stack (postgres, redis, minio, backend, celery, frontend, nginx)
docs/          ARCHITECTURE, RBAC (M1), SECURITY (M1), DATA_DICTIONARY (M2), ASSUMPTIONS
scripts/       dev bootstrap helpers
data/samples/  SAMPLE-ONLY seed data convention (real seeds arrive in M2)
Makefile       install, dev, test, lint, makemigrations, migrate, seed, build
```

## Prerequisites

- Python 3.12+
- Node.js 22+ and npm
- Docker + docker compose (only for the containerised path)
- make (optional but recommended)

## Quickstart — local venv (SQLite, zero setup)

```bash
cp .env.example .env               # every variable is documented there
./scripts/dev-bootstrap.sh         # venv + deps + .env + migrations
make dev                           # Django on :8000, Vite on :5173
```

Or manually:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
cp .env.example .env
.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py runserver 0.0.0.0:8000   # terminal 1
cd frontend && npm ci && npm run dev                        # terminal 2
```

Development settings (`config.settings.dev`) fall back to SQLite
(`backend/db.sqlite3`) when `DATABASE_URL` is unset, so tests run with no
external services. Set `DATABASE_URL` to use PostgreSQL locally.

## Quickstart — docker compose (full stack)

```bash
cp .env.example .env
make dev-docker
# equivalent: docker compose --env-file .env -f infra/docker-compose.yml up --build
```

Services: postgres:5432, redis:6379, minio:9000/:9001 (console), backend
(gunicorn):8000, celery worker, frontend (nginx):5173, edge nginx:8080.
The stack is the single-origin contract: app at `/`, API at `/api/`, probes at
`/health/` and `/health/ready/` (see `infra/nginx.conf`).

> Note: the compose stack requires Docker and is not executable in every
> environment; the files are the contract for the containerised path.

## Production settings

`config.settings.prod` **requires** a PostgreSQL `DATABASE_URL`
(`postgres://` or `postgresql://`), `DJANGO_SECRET_KEY` and
`DJANGO_ALLOWED_HOSTS`, and refuses to start otherwise. It forces DEBUG off,
uses Redis for the cache, and enables HTTPS cookie flags/HSTS behind the nginx
reverse proxy. There is no SQLite fallback in production — this is deliberate.

## Tests and checks

```bash
make test        # pytest (backend smoke tests: /health/, /health/ready/, OpenAPI schema)
make lint        # ruff (backend) + npm run lint (frontend)
make check       # Django system check
make seed        # sample seed loader (wired stub until M2)
make build       # frontend production build
```

OpenAPI: schema at `http://localhost:8000/api/schema/` (JSON: `?format=json`),
interactive docs at `http://localhost:8000/api/docs/`.

## CI (.github/workflows/ci.yml)

Lint (ruff) · type-check (mypy) · tests (pytest against a Postgres service) ·
dependency audit (pip-audit + npm audit) · SAST (bandit) · frontend build +
axe accessibility check (WCAG 2.1 AA target, GIGW 3.0).

## Configuration

Every environment variable is documented in `.env.example`. Secrets never go
into the repository; `.env` is gitignored.

## Documentation

- `docs/ARCHITECTURE.md` — system overview
- `docs/ASSUMPTIONS.md` — explicit assumptions made where the spec is silent
- `docs/RBAC.md` — roles and permissions (matrix enforced in M1)
- `docs/SECURITY.md` — security baseline and M1 threat-model plan
- `docs/DATA_DICTIONARY.md` — model reference (M2)
- `data/samples/README.md` — SAMPLE-ONLY data convention

## Evidence discipline

Claims about the legacy system are labelled `[MEASURED]` (verified from served
files) or `[TO CONFIRM]` (reported, unverified). Do not repeat unverified
claims as fact; do not print national-scale figures in product UI copy.
