"""Accounts routes — D1 auth surface (BRIEF_M4 §3 D1).

Mounted at ``/api/v1/accounts/`` (single origin; PLAN_ACCESS_ARCHITECTURE §6).
These are the FIRST login routes in the system (M3-A2 deferred auth UI to M4).
"""
from django.urls import path

from apps.accounts import security_views

from . import views

app_name = "accounts"

urlpatterns = [
    path("otp/request/", views.OtpRequestView.as_view(), name="otp-request"),
    path("otp/verify/", views.OtpVerifyView.as_view(), name="otp-verify"),
    path("captcha/", views.CaptchaView.as_view(), name="captcha"),
    path(
        'security-challenge/',
        security_views.SecurityChallengeView.as_view(),
        name='security-challenge',
    ),
    path("login/", views.PasswordLoginView.as_view(), name="login"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("me/", views.MeView.as_view(), name="me"),
    path(
        "password/change/", views.ChangePasswordView.as_view(), name="password-change"
    ),
]
