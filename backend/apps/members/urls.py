"""Members routes — M4 D3 join decisions + M4 D4 dynamic student roster.

Mounted at ``/api/v1/members/``. Every route is club-activity-controlling:
club authorities for writes/imports/exports (scope-keyed to the caller's
club, W9/W6), and roster READS are scoped per caller (a student sees their
own rows only — the policy layer decides, never the view).
"""

from django.urls import path

from . import roster_views, views

app_name = "members"

urlpatterns = [
    path("joins/", views.JoinRequestListView.as_view(), name="join-list"),
    path(
        "joins/<int:pk>/confirm/",
        views.JoinRequestConfirmView.as_view(),
        name="join-confirm",
    ),
    path(
        "joins/<int:pk>/reject/",
        views.JoinRequestRejectView.as_view(),
        name="join-reject",
    ),
    # --- M4 D4: dynamic student roster (BRIEF_M4 §3 D4) --------------------
    path("roster/", roster_views.RosterListView.as_view(), name="roster-list"),
    path(
        "roster/add/",
        roster_views.RosterCreateView.as_view(),
        name="roster-add",
    ),
    path(
        "roster/<int:pk>/",
        roster_views.RosterEditView.as_view(),
        name="roster-edit",
    ),
    path(
        "roster/<int:pk>/status/",
        roster_views.RosterStatusView.as_view(),
        name="roster-status",
    ),
    path(
        "roster/import/template/",
        roster_views.RosterImportTemplateView.as_view(),
        name="roster-import-template",
    ),
    path(
        "roster/import/upload/",
        roster_views.RosterImportUploadView.as_view(),
        name="roster-import-upload",
    ),
    path(
        "roster/import/dry-run/",
        roster_views.RosterImportDryRunView.as_view(),
        name="roster-import-dry-run",
    ),
    path(
        "roster/import/commit/",
        roster_views.RosterImportCommitView.as_view(),
        name="roster-import-commit",
    ),
    path(
        "roster/import/jobs/<int:pk>/",
        roster_views.RosterImportJobView.as_view(),
        name="roster-import-job",
    ),
    path(
        "roster/export/",
        roster_views.RosterExportView.as_view(),
        name="roster-export",
    ),
]
