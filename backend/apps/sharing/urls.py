"""Sharing routes — 3-Tier Curated NDLI Libraries (Club, Personal, Community).

Mounted at ``/api/v1/sharing/``.
"""

from django.urls import path

from . import views

app_name = "sharing"

urlpatterns = [
    path("libraries/", views.LibraryListView.as_view(), name="library-list"),
    path(
        "libraries/<int:pk>/", views.LibraryDetailView.as_view(), name="library-detail"
    ),
    path(
        "libraries/<int:library_id>/resources/",
        views.ResourceLinkCreateView.as_view(),
        name="resource-create",
    ),
    path(
        "resources/<int:pk>/",
        views.ResourceLinkDeleteView.as_view(),
        name="resource-delete",
    ),
    path(
        "resources/<int:pk>/click/",
        views.ResourceLinkClickTrackView.as_view(),
        name="resource-click",
    ),
]
