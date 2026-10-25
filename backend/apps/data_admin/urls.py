"""URLs for the red-zone data-admin surface.

Mounted at ``/admin/api/v1/data/`` in ``config/urls.py`` - before
``path("admin/", admin.site.urls)`` so the API prefix is never shadowed.
"""
from django.urls import path

from .views import HardResetView

app_name = "data_admin"

urlpatterns = [
    path("hard-reset/", HardResetView.as_view(), name="hard-reset"),
]
