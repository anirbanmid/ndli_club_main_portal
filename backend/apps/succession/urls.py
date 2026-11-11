"""Succession club routes — dual-control succession desk.

Mounted at ``/api/v1/succession/``. Club-authority door: read access for all
four authority tiers (the Executive Council stays view-only), write access
for Main Admins only — enforced by the gates in ``views`` plus
``services.ensure_main_admin`` / ``services.authorize_decision``.
"""

from django.urls import path

from . import views

app_name = "succession"

urlpatterns = [
    path("", views.ClubSuccessionListCreateView.as_view(), name="request-list"),
    path(
        "<uuid:pk>/",
        views.ClubSuccessionDetailView.as_view(),
        name="request-detail",
    ),
    path(
        "<uuid:pk>/decide/",
        views.ClubSuccessionDecideView.as_view(),
        name="request-decide",
    ),
]
