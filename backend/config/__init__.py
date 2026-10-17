"""Django project package for the NDLI Club Main Portal."""

from .celery import app as celery_app

__all__ = ("celery_app",)
