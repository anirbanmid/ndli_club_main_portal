"""URLs for the red-zone data-admin surface.

Mounted at ``/admin/api/v1/data/`` in ``config/urls.py`` - before
``path("admin/", admin.site.urls)`` so the API prefix is never shadowed.
"""
from django.urls import path

from . import views

app_name = "data_admin"

urlpatterns = [
    path("hard-reset/", views.HardResetView.as_view(), name="hard-reset"),
    path("master-csv/", views.MasterClubsCSVView.as_view(), name="master-csv"),
    path("local-backups/", views.LocalBackupView.as_view(), name="local-backups"),
]
