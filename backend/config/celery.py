"""Celery application for asynchronous work (notifications, imports, reports).

Workers are started with ``celery -A config worker``. Broker and result backend
URLs come from the CELERY_BROKER_URL / CELERY_RESULT_BACKEND environment
variables (see .env.example).

NOTE: this module deliberately does NOT default DJANGO_SETTINGS_MODULE.
Because ``config/__init__.py`` imports it eagerly, any ``setdefault`` here ran
BEFORE ``config.wsgi`` / ``config.asgi`` could apply their own default, so the
dev settings silently won the race on every production boot (DEBUG=True in
prod). Each entry point now owns its default: manage.py -> dev, wsgi/asgi ->
prod, and celery workers require the variable to be set explicitly (the docker
compose stack and .env.example already do).
"""

from celery import Celery

app = Celery("ndli_club")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
