"""Clubs routes — M4 D3 showcase + campus self-join (BRIEF_M4 §3 D3).

Mounted at ``/api/v1/clubs/``. Two doors:

* PUBLIC — showcase directory/page and the passkey/QR join OTP door
  (anonymous by necessity, like the D1 login door);
* DASHBOARD — everything that controls the club's official activity
  (showcase edit, passkey lifecycle, join URL/QR) — club authorities only,
  enforced server-side (W9).
"""

from django.urls import path

from . import views

app_name = "clubs"

urlpatterns = [
    path(
        "showcase/canonical/",
        views.CanonicalClubsListView.as_view(),
        name="showcase-canonical-clubs",
    ),
    # Public surface (read-only + the join door).
    path("showcase/", views.ShowcaseIndexView.as_view(), name="showcase-index"),
    path(
        "showcase/<slug:slug>/",
        views.ShowcaseDetailView.as_view(),
        name="showcase-detail",
    ),
    path(
        "join/otp/request/",
        views.JoinOtpRequestView.as_view(),
        name="join-otp-request",
    ),
    path("join/complete/", views.JoinCompleteView.as_view(), name="join-complete"),
    # Dashboard surface (W9: club authorities, fresh password).
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path(
        "dashboard/showcase/",
        views.ShowcaseEditView.as_view(),
        name="dashboard-showcase",
    ),
    path(
        "dashboard/passkey/",
        views.PasskeyStatusView.as_view(),
        name="dashboard-passkey",
    ),
    path(
        "dashboard/passkey/issue/",
        views.PasskeyIssueView.as_view(),
        name="dashboard-passkey-issue",
    ),
    path(
        "dashboard/passkey/regenerate/",
        views.PasskeyRegenerateView.as_view(),
        name="dashboard-passkey-regenerate",
    ),
    path(
        "dashboard/passkey/revoke/",
        views.PasskeyRevokeView.as_view(),
        name="dashboard-passkey-revoke",
    ),
    path(
        "dashboard/passkey/join-url/",
        views.JoinUrlView.as_view(),
        name="dashboard-passkey-join-url",
    ),
    path(
        "dashboard/passkey/qr.svg",
        views.PasskeyQrView.as_view(),
        name="dashboard-passkey-qr",
    ),
]

# M6 D5 Q1 Path A step 1: club authority submits a renewal request.
urlpatterns += [
    path(
        "renewal/request/",
        views.RenewalRequestView.as_view(),
        name="renewal-request",
    ),
]
