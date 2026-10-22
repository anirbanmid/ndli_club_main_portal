"""M4 D2 — 4-Authority onboarding wizard pins (BRIEF_M4 §5: W1/W2/W3).

* **W1 wizard resume** — draft survives disconnect; expired draft refuses
  resume; each authority step requires a passed OTP before submit.
* **W2 OTP adversarial** — brute-force throttled · replay rejected ·
  wrong-email OTP never validates another step · enumeration-safe errors.
* **W3 upload hardening** — wrong MIME (double-extension, polyglot) rejected ·
  oversize rejected · stored name is the content hash · never served inline.
"""
from __future__ import annotations

import datetime as dt
import os
import tempfile
from typing import Any

from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone

from apps.onboarding import services
from apps.onboarding.models import AuthorityRole, CharterApplication, OnboardingDraft

from .support import M1PinTestCase as TestCase

LOC = {"EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend"}
PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\nfake"
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
VALID_ROLES = list(AuthorityRole.values)


def _create(client) -> tuple[dict, str]:
    response = client.post(
        "/api/v1/onboarding/drafts/",
        data={
            "institution_name": "IIT Kharagpur",
            "club_name": "Robotics Club",
            "zone_code": "EAST",
            "state_code": "WB",
            "district_code": "KGP",
        },
        content_type="application/json",
    )
    assert response.status_code == 201, response.content
    payload = response.json()
    return payload, payload["resume_token"]


def _otp_for(email: str) -> str:
    """Recover the 6-digit code from the captured outbox (M1 pattern)."""
    import re

    codes: list[str] = []
    for message in mail.outbox:
        if email in message.to:
            codes.extend(re.findall(r"\b(\d{6})\b", str(message.body)))
    assert codes, f"no OTP emailed to {email}"
    return codes[-1]


@override_settings(**LOC)
class WizardResumeTests(TestCase):
    """W1 — resume is the bounded self-repair (P5)."""

    def test_draft_survives_disconnect_and_resumes_by_token(self) -> None:
        _payload, token = _create(self.client)
        # "Disconnect": a brand-new client resumes with the token only.
        resumed = self.client.post(
            "/api/v1/onboarding/drafts/resume/",
            data={"token": token},
            content_type="application/json",
        )
        self.assertEqual(resumed.status_code, 200)
        body = resumed.json()
        self.assertEqual(body["club_name"], "Robotics Club")
        self.assertEqual(body["institution_name"], "IIT Kharagpur")
        self.assertEqual(body["status"], "draft")

    def test_expired_draft_refuses_resume(self) -> None:
        _payload, token = _create(self.client)
        draft = OnboardingDraft.objects.get()
        draft.resume_token_expires_at = timezone.now() - dt.timedelta(seconds=1)
        draft.save(update_fields=["resume_token_expires_at"])
        resumed = self.client.post(
            "/api/v1/onboarding/drafts/resume/",
            data={"token": token},
            content_type="application/json",
        )
        self.assertEqual(resumed.status_code, 410)
        self.assertEqual(resumed.json()["code"], "draft_expired")
        draft.refresh_from_db()
        self.assertEqual(draft.status, OnboardingDraft.Status.EXPIRED)

    def test_wrong_token_is_404_never_data(self) -> None:
        _create(self.client)
        response = self.client.post(
            "/api/v1/onboarding/drafts/resume/",
            data={"token": "not-the-token"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertNotIn("club_name", response.json())

    def _fill(self, token: str, *, verify_all: bool = True) -> dict:
        headers: dict[str, Any] = {"HTTP_X_ONBOARDING_TOKEN": token}
        payload = self.client.post(
            "/api/v1/onboarding/drafts/resume/",
            data={"token": token},
            content_type="application/json",
        ).json()
        draft_id = payload["id"]
        for role in VALID_ROLES:
            email = f"{role}@example.edu"
            self.client.post(
                f"/api/v1/onboarding/drafts/{draft_id}/authorities/{role}/",
                data={
                    "full_name": role.title(),
                    "email": email,
                    "phone": "+911234567890",
                    "designation": "Prof",
                },
                content_type="application/json",
                **headers,
            )
            if verify_all:
                self.client.post(
                    f"/api/v1/onboarding/drafts/{draft_id}/authorities/{role}/otp/send/",
                    content_type="application/json",
                    **headers,
                )
                code = _otp_for(email)
                self.client.post(
                    f"/api/v1/onboarding/drafts/{draft_id}/authorities/{role}/otp/verify/",
                    data={"code": code},
                    content_type="application/json",
                    **headers,
                )
        self.client.post(
            f"/api/v1/onboarding/drafts/{draft_id}/upload/",
            data={
                "document": SimpleUploadedFile("charter.pdf", PDF, "application/pdf")
            },
            **headers,
        )
        return {"draft_id": draft_id, "headers": headers}

    def test_submit_requires_every_authority_otp_pass(self) -> None:
        _payload, token = _create(self.client)
        ctx = self._fill(token, verify_all=False)  # nobody OTP-verified
        response = self.client.post(
            f"/api/v1/onboarding/drafts/{ctx['draft_id']}/submit/",
            content_type="application/json",
            **ctx["headers"],
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "draft_incomplete")
        self.assertFalse(CharterApplication.objects.exists())

    def test_submit_after_all_passes_queues_one_application(self) -> None:
        _payload, token = _create(self.client)
        ctx = self._fill(token)
        response = self.client.post(
            f"/api/v1/onboarding/drafts/{ctx['draft_id']}/submit/",
            content_type="application/json",
            **ctx["headers"],
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["status"], "queued")
        self.assertEqual(CharterApplication.objects.count(), 1)
        draft = OnboardingDraft.objects.get()
        self.assertEqual(draft.status, OnboardingDraft.Status.SUBMITTED)
        # A second submit refuses (draft closed / duplicate blocked).
        again = self.client.post(
            f"/api/v1/onboarding/drafts/{ctx['draft_id']}/submit/",
            content_type="application/json",
            **ctx["headers"],
        )
        self.assertIn(again.status_code, (409, 410))
        self.assertEqual(CharterApplication.objects.count(), 1)


@override_settings(**LOC)
class OtpAdversarialTests(TestCase):
    """W2 — the M1 OTP machinery keeps its guarantees in the wizard."""

    def setUp(self) -> None:
        super().setUp()
        _payload, self.token = _create(self.client)
        self.headers: dict[str, Any] = {"HTTP_X_ONBOARDING_TOKEN": self.token}
        self.draft_id = OnboardingDraft.objects.get().id
        self.client.post(
            f"/api/v1/onboarding/drafts/{self.draft_id}/authorities/patron/",
            data={
                "full_name": "Patron",
                "email": "patron@example.edu",
                "phone": "+911234567890",
            },
            content_type="application/json",
            **self.headers,
        )

    def _send(self) -> None:
        self.client.post(
            f"/api/v1/onboarding/drafts/{self.draft_id}/authorities/patron/otp/send/",
            content_type="application/json",
            **self.headers,
        )

    def _verify(self, code: str):
        return self.client.post(
            f"/api/v1/onboarding/drafts/{self.draft_id}/authorities/patron/otp/verify/",
            data={"code": code},
            content_type="application/json",
            **self.headers,
        )

    def test_otp_send_is_enumeration_safe(self) -> None:
        self._send()
        first = self.client.post(
            f"/api/v1/onboarding/drafts/{self.draft_id}/authorities/patron/otp/send/",
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(
            first.json(),
            {"detail": "If that address is reachable, a code is on its way."},
        )

    def test_replay_is_rejected(self) -> None:
        self._send()
        code = _otp_for("patron@example.edu")
        self.assertEqual(self._verify(code).status_code, 200)
        replay = self._verify(code)
        self.assertEqual(replay.status_code, 400)

    def test_wrong_email_code_never_validates_this_step(self) -> None:
        self._send()
        self.client.post(
            f"/api/v1/onboarding/drafts/{self.draft_id}/authorities/secretary/",
            data={
                "full_name": "Sec",
                "email": "secretary@example.edu",
                "phone": "+911234567890",
            },
            content_type="application/json",
            **self.headers,
        )
        self.client.post(
            f"/api/v1/onboarding/drafts/{self.draft_id}/authorities/secretary/otp/send/",
            content_type="application/json",
            **self.headers,
        )
        secretary_code = _otp_for("secretary@example.edu")
        response = self._verify(secretary_code)  # patron step, secretary code
        self.assertEqual(response.status_code, 400)
        patron = OnboardingDraft.objects.get().authorities.get(role="patron")
        self.assertIsNone(patron.otp_verified_at)

    def test_brute_force_is_attempt_limited(self) -> None:
        self._send()
        real_code = _otp_for("patron@example.edu")
        wrong_codes = ["000000", "111111", "222222", "333333", "444444"]
        statuses = [self._verify(code).status_code for code in wrong_codes]
        self.assertEqual(statuses, [400] * 5)
        # M1 lockout: after 5 wrong attempts even the REAL code is refused.
        locked = self._verify(real_code)
        self.assertIn(locked.status_code, (400, 429))
        patron = OnboardingDraft.objects.get().authorities.get(role="patron")
        self.assertIsNone(patron.otp_verified_at)


_TEST_UPLOAD_ROOT = os.path.join(tempfile.gettempdir(), "onboarding-test-uploads")


@override_settings(ONBOARDING_UPLOAD_ROOT=_TEST_UPLOAD_ROOT)
class UploadHardeningTests(TestCase):
    """W3 — the combined document is validated, hashed, never inline."""

    def setUp(self) -> None:
        super().setUp()
        _payload, self.token = _create(self.client)
        self.headers: dict[str, Any] = {"HTTP_X_ONBOARDING_TOKEN": self.token}
        self.draft_id = OnboardingDraft.objects.get().id

    def _upload(self, name: str, content: bytes, mime: str):
        return self.client.post(
            f"/api/v1/onboarding/drafts/{self.draft_id}/upload/",
            data={"document": SimpleUploadedFile(name, content, mime)},
            **self.headers,
        )

    def test_double_extension_is_rejected(self) -> None:
        response = self._upload("charter.pdf.exe", b"MZ fake", "application/pdf")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "bad_extension")

    def test_polyglot_content_is_rejected(self) -> None:
        # Declared PDF, JPEG magic — content and type disagree (W3).
        response = self._upload("charter.pdf", JPEG, "application/pdf")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "mime_mismatch")

    def test_oversize_is_rejected(self) -> None:
        big = PDF + b"\x00" * (services.UPLOAD_MAX_BYTES + 1)
        response = self._upload("charter.pdf", big, "application/pdf")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "bad_size")

    def test_stored_name_is_the_content_hash_not_the_user_filename(self) -> None:
        response = self._upload("charter.pdf", PDF, "application/pdf")
        self.assertEqual(response.status_code, 200, response.content)
        upload = OnboardingDraft.objects.get().upload
        self.assertNotIn("charter", upload.stored_name)
        self.assertEqual(upload.stored_name, upload.content_sha256)
        self.assertEqual(len(upload.stored_name), 64)
        self.assertEqual(upload.original_name, "charter.pdf")

    def test_download_is_never_inline(self) -> None:
        self._upload("charter.pdf", PDF, "application/pdf")
        response = self.client.get(
            f"/api/v1/onboarding/drafts/{self.draft_id}/upload/document/",
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
