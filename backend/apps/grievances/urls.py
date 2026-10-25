"""Grievances club routes — M6 D3b. Mounted at ``/api/v1/grievances/``.

Club-authority door (``CLUB_AUTHORITY_GATE``) over the caller's own-club
tickets; out-of-scope IDs resolve to 404.
"""
from django.urls import path

from . import views

app_name = "grievances"

urlpatterns = [
    path("", views.ClubTicketListCreateView.as_view(), name="ticket-list"),
    path(
        "<uuid:pk>/",
        views.ClubTicketDetailView.as_view(),
        name="ticket-detail",
    ),
]
