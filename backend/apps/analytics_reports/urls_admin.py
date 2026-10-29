"""Analytics routes — M6 D4 officer audit dashboards (D4).

Mounted at ``/admin/api/v1/dashboards/`` (admin door). Every route is behind
``DASHBOARD_GATE`` plus the service-level zone scoping: out-of-scope zones are
indistinguishable from empty ones — 404/empty, never data.
"""

from django.urls import path

from . import views

app_name = "analytics_reports_admin"

urlpatterns = [
    path("zone/", views.ZoneDashboardView.as_view(), name="zone-dashboard"),
    path("officers/", views.OfficerRatingsView.as_view(), name="officer-ratings"),
    path("audit/", views.AuditFeedView.as_view(), name="audit-feed"),
]
