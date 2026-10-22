"""Onboarding app config (M4 D2 — 4-Authority onboarding wizard)."""

from django.apps import AppConfig


class OnboardingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.onboarding"
    verbose_name = "Onboarding"
