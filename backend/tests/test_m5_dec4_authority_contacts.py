"""M5 DEC4 — mandatory authority-field enforcement (owner-locked 2026-10-23).

Every authority slot MUST carry a valid email, an Indian mobile (10 digits)
and a designation. The server enforces all three and REJECTS a submission
missing any (P4: the rule lives in ``services``; the wizard only renders the
verdict). Verdict bytes are pinned here because the UI renders them per field
verbatim (F4) — changing the wording is an API change, so every message below
is also a key of ``frontend/src/i18n/hi.json``.

* **Unit normalisation** — ``_normalize_indian_mobile`` is the SINGLE
  accept/reject source: separators, ``+91``/``0091``/``91``/``0`` prefixes.
* **Field enforcement** — ``upsert_authority`` fails fast per field.
* **API enforcement** — the same three verdicts over HTTP, with the code.
* **No partial mutation** — a rejected upsert writes nothing.
* **Submit backstop** — rows tampered BELOW the validator still cannot queue,
  and an intact draft still submits (201).
"""
from __future__ import annotations

import re
from typing import Any

from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from apps.onboarding import services
from apps.onboarding.models import AuthorityRole, OnboardingAuthority, OnboardingDraft

from .support import M1PinTestCase as TestCase

LOC = {"EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend"}
PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\nfake"
VALID_ROLES = list(AuthorityRole.values)

#: The verdict BYTES the wizard renders verbatim per field (F4).
EMAIL_REQUIRED = "An email is required."
EMAIL_INVALID = "A valid email address is required."
PHONE_REQUIRED = "An Indian mobile number is required."
PHONE_INVALID = "The mobile number must be a 10-digit Indian number."
DESIGNATION_REQUIRED = "A designation is required."
DRAFT_INCOMPLETE = (
    "Every authority step must be OTP-verified and the document "
    "uploaded before submitting."
)


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
    codes: list[str] = []
    for message in mail.outbox:
        if email in message.to:
            codes.extend(re.findall(r"\b(\d{6})\b", str(message.body)))
    assert codes, f"no OTP emailed to {email}"
    return codes[-1]


class IndianMobileNormalisationUnitTests(TestCase):
    """P4: ONE function decides accept/reject for upsert AND submit."""

    def test_plain_ten_digits_pass(self) -> None:
        self.assertEqual(
            services._normalize_indian_mobile("9876543210"), "9876543210"
        )

    def test_plus91_and_separators_normalise(self) -> None:
        self.assertEqual(
            services._normalize_indian_mobile("+91 98765-43210"), "9876543210"
        )

    def test_zero_prefix_normalises(self) -> None:
        self.assertEqual(services._normalize_indian_mobile("09876543210"), "9876543210")

    def test_bare_91_prefix_normalises(self) -> None:
        self.assertEqual(
            services._normalize_indian_mobile("919876543210"), "9876543210"
        )

    def test_nine_digits_rejected(self) -> None:
        self.assertIsNone(services._normalize_indian_mobile("987654321"))

    def test_letters_rejected(self) -> None:
        self.assertIsNone(services._normalize_indian_mobile("98abc54321"))

    def test_empty_rejected(self) -> None:
        self.assertIsNone(services._normalize_indian_mobile(""))
        self.assertIsNone(services._normalize_indian_mobile(None))


@override_settings(**LOC)
class AuthorityFieldEnforcementTests(TestCase):
    """DEC4: ``upsert_authority`` fails fast with the pinned verdict bytes."""

    def _draft(self) -> OnboardingDraft:
        draft, _token = services.create_draft(
            institution_name="IIT Kharagpur",
            club_name="Robotics Club",
            zone_code="EAST",
            state_code="WB",
            district_code="KGP",
        )
        return draft

    def _upsert(self, draft: OnboardingDraft, **overrides: Any) -> None:
        fields: dict[str, Any] = {
            "full_name": "Prof Example",
            "email": "prof@example.edu",
            "phone": "9876543210",
            "designation": "Professor",
        }
        fields.update(overrides)
        services.upsert_authority(draft, VALID_ROLES[0], **fields)

    def test_upsert_rejects_missing_mobile(self) -> None:
        draft = self._draft()
        with self.assertRaises(services.OnboardingError) as ctx:
            self._upsert(draft, phone="")
        self.assertEqual(str(ctx.exception), PHONE_REQUIRED)
        self.assertEqual(getattr(ctx.exception, "code", None), "missing_field")

    def test_upsert_rejects_bad_format_mobile(self) -> None:
        draft = self._draft()
        with self.assertRaises(services.OnboardingError) as ctx:
            self._upsert(draft, phone="12345")
        self.assertEqual(str(ctx.exception), PHONE_INVALID)

    def test_upsert_rejects_missing_designation(self) -> None:
        draft = self._draft()
        with self.assertRaises(services.OnboardingError) as ctx:
            self._upsert(draft, designation="  ")
        self.assertEqual(str(ctx.exception), DESIGNATION_REQUIRED)

    def test_upsert_rejects_missing_email_still(self) -> None:
        draft = self._draft()
        with self.assertRaises(services.OnboardingError) as ctx:
            self._upsert(draft, email="")
        self.assertEqual(str(ctx.exception), EMAIL_REQUIRED)

    def test_upsert_accepts_and_normalises_mobile(self) -> None:
        draft = self._draft()
        self._upsert(draft, phone="+91-98765 43210")
        authority = OnboardingAuthority.objects.get(draft=draft)
        self.assertEqual(authority.phone, "9876543210")
        self.assertEqual(authority.designation, "Professor")


@override_settings(**LOC)
class AuthorityContactRejectionTests(TestCase):
    """DEC4 over HTTP — the three fields are mandatory, with the wire code."""

    def _draft(self) -> tuple[str, str]:
        """One draft and ITS OWN resume token (they must come as a pair)."""
        payload, token = _create(self.client)
        return token, payload["id"]

    def _upsert(self, token: str, draft_id: str, **overrides: str):
        body: dict[str, str] = {
            "full_name": "Patron",
            "email": "patron@example.edu",
            "phone": "9876543210",
            "designation": "Professor",
        }
        body.update(overrides)
        headers: dict[str, Any] = {"HTTP_X_ONBOARDING_TOKEN": token}
        return self.client.post(
            f"/api/v1/onboarding/drafts/{draft_id}/authorities/patron/",
            data=body,
            content_type="application/json",
            **headers,
        )

    def test_valid_contacts_are_accepted(self) -> None:
        token, draft_id = self._draft()
        response = self._upsert(token, draft_id)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.json()["authorities"]["patron"]["designation"], "Professor"
        )

    def test_malformed_email_is_rejected(self) -> None:
        token, draft_id = self._draft()
        response = self._upsert(token, draft_id, email="not-an-email")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], EMAIL_INVALID)
        self.assertEqual(response.json()["code"], "invalid_field")

    def test_phone_that_is_not_ten_digits_is_rejected(self) -> None:
        token, draft_id = self._draft()
        for bad in ("12345", "12345678901", "abcdefghij", "+91 98765"):
            with self.subTest(phone=bad):
                response = self._upsert(token, draft_id, phone=bad)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["detail"], PHONE_INVALID)
                self.assertEqual(response.json()["code"], "invalid_field")

    def test_email_is_stored_lowercased(self) -> None:
        token, draft_id = self._draft()
        response = self._upsert(token, draft_id, email="Patron@Example.EDU")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.json()["authorities"]["patron"]["email"], "patron@example.edu"
        )


@override_settings(**LOC)
class IndianMobileNormalisationApiTests(TestCase):
    """The same normalisation, observed through the round-trip that ships."""

    def _upsert_phone(self, token: str, draft_id: str, raw: str) -> str:
        """Upsert the SAME slot again — one draft per club, so reuse it."""
        headers: dict[str, Any] = {"HTTP_X_ONBOARDING_TOKEN": token}
        response = self.client.post(
            f"/api/v1/onboarding/drafts/{draft_id}/authorities/patron/",
            data={
                "full_name": "Patron",
                "email": "patron@example.edu",
                "phone": raw,
                "designation": "Professor",
            },
            content_type="application/json",
            **headers,
        )
        assert response.status_code == 200, response.content
        return response.json()["authorities"]["patron"]["phone"]

    def test_common_input_forms_collapse_to_the_bare_digits(self) -> None:
        payload, token = _create(self.client)
        cases = {
            "9876543210": "9876543210",
            "+919876543210": "9876543210",
            "+91 98765 43210": "9876543210",
            "00919876543210": "9876543210",
            "09876543210": "9876543210",
            "98765-43210": "9876543210",
            "98765 43210": "9876543210",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(
                    self._upsert_phone(token, payload["id"], raw), expected
                )

    def test_the_existing_m4_fixture_phone_still_passes(self) -> None:
        """``+911234567890`` (the M4-D2 fixture) must remain valid."""
        payload, token = _create(self.client)
        self.assertEqual(
            self._upsert_phone(token, payload["id"], "+911234567890"), "1234567890"
        )


@override_settings(**LOC)
class NoPartialMutationTests(TestCase):
    """DEC4 — a rejected upsert writes nothing (P4/P5)."""

    def test_a_rejected_upsert_leaves_the_saved_slot_untouched(self) -> None:
        _payload, token = _create(self.client)
        draft_id = _payload["id"]
        headers: dict[str, Any] = {"HTTP_X_ONBOARDING_TOKEN": token}
        url = f"/api/v1/onboarding/drafts/{draft_id}/authorities/patron/"

        ok = self.client.post(
            url,
            data={
                "full_name": "Patron",
                "email": "patron@example.edu",
                "phone": "9876543210",
                "designation": "Professor",
            },
            content_type="application/json",
            **headers,
        )
        self.assertEqual(ok.status_code, 200, ok.content)

        bad = self.client.post(
            url,
            data={
                "full_name": "Patron",
                "email": "patron@example.edu",
                "phone": "12",
                "designation": "",
            },
            content_type="application/json",
            **headers,
        )
        self.assertEqual(bad.status_code, 400)

        resumed = self.client.post(
            "/api/v1/onboarding/drafts/resume/",
            data={"token": token},
            content_type="application/json",
        ).json()
        slot = resumed["authorities"]["patron"]
        self.assertEqual(slot["phone"], "9876543210")
        self.assertEqual(slot["designation"], "Professor")


@override_settings(**LOC)
class SubmitGateTests(TestCase):
    """Submit backstop: rows tampered BELOW the validator must not queue."""

    def _complete_draft(self, client: Any) -> tuple[OnboardingDraft, dict]:
        response = client.post(
            "/api/v1/onboarding/drafts/",
            data={
                "institution_name": "IIT Kharagpur",
                "club_name": "Chess Club",
                "zone_code": "EAST",
                "state_code": "WB",
                "district_code": "KGP",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        token = response.json()["resume_token"]
        headers: dict[str, Any] = {"HTTP_X_ONBOARDING_TOKEN": token}
        payload = client.post(
            "/api/v1/onboarding/drafts/resume/",
            data={"token": token},
            content_type="application/json",
        ).json()
        draft_id = payload["id"]
        for role in VALID_ROLES:
            client.post(
                f"/api/v1/onboarding/drafts/{draft_id}/authorities/{role}/",
                data={
                    "full_name": role.title(),
                    "email": f"{role}@example.edu",
                    "phone": "+911234567890",
                    "designation": "Prof",
                },
                content_type="application/json",
                **headers,
            )
            client.post(
                f"/api/v1/onboarding/drafts/{draft_id}/authorities/{role}/otp/send/",
                content_type="application/json",
                **headers,
            )
            codes: list[str] = []
            for message in mail.outbox:
                if f"{role}@example.edu" in message.to:
                    codes.extend(re.findall(r"\b(\d{6})\b", str(message.body)))
            self.assertTrue(codes)
            client.post(
                f"/api/v1/onboarding/drafts/{draft_id}/authorities/{role}/otp/verify/",
                data={"code": codes[-1]},
                content_type="application/json",
                **headers,
            )
        client.post(
            f"/api/v1/onboarding/drafts/{draft_id}/upload/",
            data={
                "document": SimpleUploadedFile(
                    "charter.pdf", PDF, "application/pdf"
                )
            },
            **headers,
        )
        return OnboardingDraft.objects.get(id=draft_id), headers

    def _submit(self, client: Any, draft: OnboardingDraft, headers: dict) -> Any:
        return client.post(
            f"/api/v1/onboarding/drafts/{draft.id}/submit/",
            content_type="application/json",
            **headers,
        )

    def _refuses(
        self, expected_detail: str, tamper: str, field: str = "phone"
    ) -> None:
        draft, headers = self._complete_draft(self.client)
        OnboardingAuthority.objects.filter(draft=draft).update(**{field: tamper})
        response = self._submit(self.client, draft, headers)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], expected_detail)
        self.assertEqual(
            OnboardingDraft.objects.get(pk=draft.pk).status,
            OnboardingDraft.Status.DRAFT,
        )

    def test_submit_rejects_row_missing_mobile(self) -> None:
        self._refuses(PHONE_REQUIRED, "")

    def test_submit_rejects_row_bad_mobile_format(self) -> None:
        self._refuses(PHONE_INVALID, "12345")

    def test_submit_rejects_row_missing_designation(self) -> None:
        self._refuses(DESIGNATION_REQUIRED, "", field="designation")

    def test_submit_passes_with_valid_rows(self) -> None:
        draft, headers = self._complete_draft(self.client)
        response = self._submit(self.client, draft, headers)
        self.assertEqual(response.status_code, 201, response.content)
