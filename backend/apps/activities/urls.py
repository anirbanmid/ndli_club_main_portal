"""URL routing for the activities surface."""

from django.urls import path

from . import views

app_name = "activities"

urlpatterns = [
    path("", views.ActivityLogListView.as_view(), name="activity-list"),
    path("log/", views.ActivityLogCreateView.as_view(), name="activity-log"),
    path("delete/", views.ActivityDeleteView.as_view(), name="activity-delete"),
    path("export/", views.ActivityExportCSVView.as_view(), name="activity-export"),
    path(
        "clubs/",
        views.UniversalClubsListView.as_view(),
        name="universal-clubs-list",
    ),
    path(
        "clubs-export/",
        views.EmployeeClubsExportCSVView.as_view(),
        name="employee-clubs-export",
    ),
    path(
        "pi-signature-settings/",
        views.PISignatureSettingsView.as_view(),
        name="pi-signature-settings",
    ),
    path(
        "pi-signature/",
        views.PISignatureImageView.as_view(),
        name="pi-signature-image",
    ),
    path(
        "verify-password/",
        views.VerifyEmployeePasswordView.as_view(),
        name="verify-password",
    ),
    path(
        "clubs/renew/",
        views.ClubRenewView.as_view(),
        name="club-renew",
    ),
]
