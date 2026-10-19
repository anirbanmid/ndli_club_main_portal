# NDLI Club Main Portal — monorepo task runner.
# Common targets: install, dev, test, lint, makemigrations, migrate, seed, build.
# See README.md for the full workflow.

VENV ?= .venv
PY := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/pytest
RUFF := $(VENV)/bin/ruff
BACKEND := backend
FRONTEND := frontend
COMPOSE := docker compose --env-file .env -f infra/docker-compose.yml

.PHONY: help install dev dev-docker test lint fmt makemigrations migrate seed build check clean

help:
	@echo "NDLI Club Main Portal — available targets:"
	@echo "  install         create venv and install backend + frontend dependencies"
	@echo "  dev             run Django dev server and Vite dev server"
	@echo "  dev-docker      run the full docker-compose stack"
	@echo "  test            run the backend test suite (pytest)"
	@echo "  lint            ruff (backend) + npm run lint (frontend)"
	@echo "  fmt             auto-format backend code with ruff"
	@echo "  makemigrations  create Django migrations"
	@echo "  migrate         apply Django migrations"
	@echo "  seed            load SAMPLE-ONLY seed data (idempotent; M2)"
	@echo "  seed-reset      bounded reset of seed rows + reload (guarded; M2)"
	@echo "  verify-domain   report domain integrity findings (read-only; M2)"
	@echo "  build           build the frontend for production"
	@echo "  check           Django system check"
	@echo "  clean           remove build artefacts and caches"

.PHONY: seed-reset verify-domain

install:
	python3 -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r $(BACKEND)/requirements-dev.txt
	cd $(FRONTEND) && npm ci

dev:
	$(PY) $(BACKEND)/manage.py runserver 0.0.0.0:8000 & \
	cd $(FRONTEND) && npm run dev & \
	wait

dev-docker:
	$(COMPOSE) up --build

test:
	cd $(BACKEND) && ../$(PYTEST)

lint:
	$(RUFF) check $(BACKEND)
	cd $(FRONTEND) && npm run lint

fmt:
	$(RUFF) check --fix $(BACKEND)
	$(RUFF) format $(BACKEND)

makemigrations:
	$(PY) $(BACKEND)/manage.py makemigrations

migrate:
	$(PY) $(BACKEND)/manage.py migrate

seed:
	$(PY) $(BACKEND)/manage.py seed_samples

seed-reset:
	$(PY) $(BACKEND)/manage.py seed_samples --reset

verify-domain:
	$(PY) $(BACKEND)/manage.py verify_domain

build:
	cd $(FRONTEND) && npm run build

check:
	$(PY) $(BACKEND)/manage.py check

clean:
	rm -rf $(BACKEND)/staticfiles $(BACKEND)/.pytest_cache $(BACKEND)/.mypy_cache $(BACKEND)/.ruff_cache $(FRONTEND)/dist
	find . -name '__pycache__' -type d -not -path './.venv/*' -exec rm -rf {} +
