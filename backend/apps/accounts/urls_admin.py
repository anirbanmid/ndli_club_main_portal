"""Employee Management & Admin Super-Power routes.

Mounted at ``/admin/api/v1/employees/`` in ``config/urls.py``.
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
    path(
        "create/",
        views_admin.EmployeeCreateView.as_view(),
        name="employee-create",
    ),
    path(
        "<int:officer_id>/update/",
        views_admin.EmployeeUpdateView.as_view(),
        name="employee-update",
    ),
    path(
        "<int:officer_id>/status/",
        views_admin.EmployeeStatusToggleView.as_view(),
        name="employee-status",
    ),
    path(
        "totp/setup/",
        views_admin.AdminTotpSetupView.as_view(),
        name="admin-totp-setup",
    ),
    path(
        "totp/verify-setup/",
        views_admin.AdminTotpVerifySetupView.as_view(),
        name="admin-totp-verify-setup",
    ),
    path(
        "clubs/",
        views_admin.AdminClubListView.as_view(),
        name="admin-clubs-list",
    ),
    path(
        "clubs/<str:club_code>/reset-password/",
        views_admin.AdminClubPasswordResetView.as_view(),
        name="club-reset-password",
    ),
    path(
        "clubs/<str:club_code>/update/",
        views_admin.AdminClubUpdateView.as_view(),
        name="club-update",
    ),
]
