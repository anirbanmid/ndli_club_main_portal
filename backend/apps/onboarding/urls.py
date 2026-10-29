"""Onboarding routes — M4 D2 wizard (BRIEF_M4 §3 D2).

Mounted at ``/api/v1/onboarding/`` (single origin; PLAN_ACCESS_ARCHITECTURE §6).
All routes are capability-token gated (X-Onboarding-Token) — the authorities
have no accounts yet; each step is OTP-validated in place (W1/W2).
"""

from django.urls import path

from . import views

app_name = "onboarding"

urlpatterns = [
    path("drafts/", views.DraftCreateView.as_view(), name="draft-create"),
    path("drafts/resume/", views.DraftResumeView.as_view(), name="draft-resume"),
    path(
        "drafts/<str:draft_id>/identity/",
        views.IdentityView.as_view(),
        name="identity",
    ),
    path(
        "drafts/<str:draft_id>/authorities/<str:role>/",
        views.AuthorityUpsertView.as_view(),
        name="authority-upsert",
    ),
    path(
        "drafts/<str:draft_id>/authorities/<str:role>/otp/send/",
        views.AuthorityOtpSendView.as_view(),
        name="authority-otp-send",
    ),
    path(
        "drafts/<str:draft_id>/authorities/<str:role>/otp/verify/",
        views.AuthorityOtpVerifyView.as_view(),
        name="authority-otp-verify",
    ),
    path(
        "drafts/<str:draft_id>/upload/",
        views.UploadView.as_view(),
        name="upload",
    ),
    path(
        "drafts/<str:draft_id>/upload/document/",
        views.DocumentDownloadView.as_view(),
        name="upload-download",
    ),
    path(
        "drafts/<str:draft_id>/submit/",
        views.SubmitView.as_view(),
        name="submit",
    ),
]
