"""Public API routes (Module 1 — General Public, no login).

Mounted at ``/api/v1/public/`` (single origin; PLAN_ACCESS_ARCHITECTURE §6).
"""

from django.urls import path

from . import views

app_name = "public_api"

urlpatterns = [
    path("telemetry/", views.TelemetryView.as_view(), name="telemetry"),
    path("directory/", views.DirectorySearchView.as_view(), name="directory"),
    path("verify/", views.VerifyCertificateView.as_view(), name="verify"),
]
