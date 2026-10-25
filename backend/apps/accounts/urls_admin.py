"""Employee Management routes (M6 D5).

Mounted at ``/admin/api/v1/employees/`` in ``config/urls.py`` — before
``admin.site.urls`` so the API prefix is never shadowed (same rule as the
other admin-module APIs).
"""
from django.urls import path

from . import views_admin

app_name = "accounts_admin"

urlpatterns = [
    path("", views_admin.EmployeeListView.as_view(), name="employee-list"),
    path("states/", views_admin.StateListView.as_view(), name="state-list"),
    path(
        "<int:officer_id>/duty/",
        views_admin.EmployeeDutyView.as_view(),
        name="employee-duty",
    ),
]
