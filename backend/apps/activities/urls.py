"""Activities routes -- M6 D8 employee-module parity (PLAN_0018 section 6).

Mounted at ``/api/v1/activities/``. Authenticated employee surface
(self-or-Central-Admin scoping is enforced in the views, W9 style).
"""
from django.urls import path

from . import views

app_name = "activities"

urlpatterns = [
    path("", views.ActivityLogListView.as_view(), name="activity-list"),
    path("log/", views.ActivityLogCreateView.as_view(), name="activity-log"),
    path("delete/", views.ActivityDeleteView.as_view(), name="activity-delete"),
]
