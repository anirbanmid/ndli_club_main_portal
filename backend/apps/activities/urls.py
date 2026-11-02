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
    path(
        "integrity/",
        views.LedgerIntegrityView.as_view(),
        name="ledger-integrity",
    ),
]


urlpatterns += [
    path("events/", views.ClubEventListCreateView.as_view(), name="event-list-create"),
    path("events/<int:pk>/", views.ClubEventDetailView.as_view(), name="event-detail"),
    path(
        "events/<int:pk>/participate/",
        views.EventParticipateView.as_view(),
        name="event-participate",
    ),
    path(
        "events/<int:pk>/collaborate/",
        views.EventCollaborationRequestView.as_view(),
        name="event-collaborate",
    ),
    path(
        "events/collaborations/<int:collab_id>/respond/",
        views.EventCollaborationRespondView.as_view(),
        name="event-collab-respond",
    ),
    path(
        "events/collaborations/<int:collab_id>/retry/",
        views.EventCollaborationRetryView.as_view(),
        name="event-collab-retry",
    ),
    path(
        "events/<int:pk>/upload-participants/",
        views.EventParticipantUploadView.as_view(),
        name="event-upload-participants",
    ),
    path(
        "events/<int:pk>/download-certificates-zip/",
        views.EventCertificatesZipDownloadView.as_view(),
        name="event-download-certificates-zip",
    ),
    path(
        "events/<int:pk>/approve-certificates/",
        views.EventCertificateApprovalView.as_view(),
        name="event-approve-certificates",
    ),
    path(
        "events/<int:pk>/attendees/",
        views.EventAttendeesListView.as_view(),
        name="event-attendees",
    ),
    path(
        "events/<int:pk>/my-certificate/",
        views.EventMyCertificateView.as_view(),
        name="event-my-certificate",
    ),
    path(
        "events/<int:event_id>/conductors/<int:conductor_id>/certificate/",
        views.EventConductorCertificateView.as_view(),
        name="conductor-certificate",
    ),
]
