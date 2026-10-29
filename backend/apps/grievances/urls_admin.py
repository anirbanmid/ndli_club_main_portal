"""Grievances dispatcher routes — M6 D3b. Mounted at ``/admin/api/v1/grievances/``.

Distinct ``app_name`` (``grievances_admin``) on purpose: two includes of the
same app_name collide in ``reverse()``. The admin-module routes MUST live
under ``/admin/`` (the T3 "admin prefix is the only admin door" pin).
"""

from django.urls import path

from . import views

app_name = "grievances_admin"

urlpatterns = [
    path("queue/", views.GrievanceQueueView.as_view(), name="queue"),
    path("sweep/", views.GrievanceSweepView.as_view(), name="sweep"),
    path(
        "<uuid:pk>/",
        views.GrievanceDetailView.as_view(),
        name="detail",
    ),
    path(
        "<uuid:pk>/resolve/",
        views.GrievanceResolveView.as_view(),
        name="resolve",
    ),
]
