"""Celery application for asynchronous work (notifications, imports, reports).

Workers are started with ``celery -A config worker``. Broker and result backend
URLs come from the CELERY_BROKER_URL / CELERY_RESULT_BACKEND environment
variables (see .env.example).
"""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("ndli_club")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
