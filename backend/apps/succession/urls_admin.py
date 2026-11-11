"""Succession employee-desk routes — mounted at ``/admin/api/v1/succession/``.

Distinct ``app_name`` (``succession_admin``) on purpose: two includes of the
same app_name collide in ``reverse()``. The admin-module routes MUST live
under ``/admin/`` (the T3 "admin prefix is the only admin door" pin).
"""

from django.urls import path

from . import views

app_name = "succession_admin"

urlpatterns = [
    path("desk/", views.SuccessionDeskView.as_view(), name="desk"),
    path(
        "<uuid:pk>/",
        views.SuccessionDeskDetailView.as_view(),
        name="detail",
    ),
    path(
        "<uuid:pk>/decide/",
        views.SuccessionDeskDecideView.as_view(),
        name="decide",
    ),
]
