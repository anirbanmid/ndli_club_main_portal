"""Governance routes — M6 charter desk (D2c). Mounted at ``/admin/api/v1/governance/``.

Every route is behind ``CHARTER_GATE`` (admin module, decider sub-roles) and
the service-level zone scoping; out-of-scope IDs resolve to 404.
"""

from django.urls import path

from . import views, views_insights, views_renewals

app_name = "governance"

urlpatterns = [
    path("charter/queue/", views.CharterQueueView.as_view(), name="charter-queue"),
    path(
        "charter/<uuid:pk>/",
        views.CharterDetailView.as_view(),
        name="charter-detail",
    ),
    path(
        "charter/<uuid:pk>/uploads/<int:upload_id>/",
        views.CharterUploadView.as_view(),
        name="charter-upload",
    ),
    path(
        "charter/<uuid:pk>/decision/",
        views.CharterDecisionView.as_view(),
        name="charter-decision",
    ),
]

# M6 D5 renewal desk (both Q1 paths) — same admin door, its own namespace
# suffix lives in the route names (app_name is shared with the charter desk).
urlpatterns += [
    path("renewals/", views_renewals.RenewalListView.as_view(), name="renewals"),
    path(
        "renewals/attention/",
        views_renewals.RenewalAttentionView.as_view(),
        name="renewal-attention",
    ),
    path(
        "renewals/issue/",
        views_renewals.RenewalDirectIssueView.as_view(),
        name="renewal-issue-direct",
    ),
    path(
        "renewals/<int:pk>/issue/",
        views_renewals.RenewalIssueView.as_view(),
        name="renewal-issue",
    ),
    path(
        "renewals/<int:pk>/reject/",
        views_renewals.RenewalRejectView.as_view(),
        name="renewal-reject",
    ),
]

# M6 D5 MCC insights (read-only strategic report — CentralAdmin only).
urlpatterns += [
    path(
        "insights/report/",
        views_insights.StrategicReportView.as_view(),
        name="insights-report",
    ),
]
