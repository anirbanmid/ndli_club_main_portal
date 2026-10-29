"""The ONE EmailProvider interface and its drivers (BRIEF_M1.md §2a / §6b).

Drivers:

* ``console`` — dev/CI driver; hands the message to Django's email backend
  (console backend prints it to the log; the ``locmem`` backend captures it
  for tests). Nothing leaves the machine.
* ``sendgrid`` — the NDLI Club existing system's provider. Fully wired but
  only active when ``SENDGRID_API_KEY`` is configured (M10 handover task).
  Unit-tested against a stubbed HTTP transport; zero real API calls in tests.

There is NO SMS/voice adapter in this product — email is the only
verification channel (user decision 2026-10-17 23:13).
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass

from django.conf import settings
from django.core.mail import send_mail


class EmailDeliveryError(RuntimeError):
    """Raised when an email could not be handed to the provider."""


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    body: str


class EmailProvider(ABC):
    """Single send interface shared by every driver."""

    @abstractmethod
    def send(self, message: EmailMessage) -> None:
        """Deliver one plain-text message (or raise EmailDeliveryError)."""


class ConsoleEmailProvider(EmailProvider):
    """Dev/test driver: Django's email backend (console prints, locmem captures)."""

    def send(self, message: EmailMessage) -> None:
        send_mail(
            subject=message.subject,
            message=message.body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[message.to],
            fail_silently=False,
        )


def _urllib_transport(url: str, headers: dict[str, str], payload: bytes) -> int:
    """Default HTTP transport for the SendGrid driver (urllib, no extra deps)."""
    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        # The request URL is the fixed SendGrid https class constant — never user input.
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310  # nosec B310
            return int(response.status)
    except urllib.error.HTTPError as exc:  # pragma: no cover - network path
        return int(exc.code)


class SendGridEmailProvider(EmailProvider):
    """SendGrid v3 mail/send driver (configured at M10 handover)."""

    ENDPOINT = "https://api.sendgrid.com/v3/mail/send"

    def __init__(
        self,
        api_key: str | None = None,
        transport: object | None = None,
    ) -> None:
        self.api_key = api_key or getattr(settings, "SENDGRID_API_KEY", "")
        self.transport = transport or _urllib_transport

    def send(self, message: EmailMessage) -> None:
        if not self.api_key:
            raise EmailDeliveryError("SENDGRID_API_KEY is not configured")
        payload = {
            "personalizations": [{"to": [{"email": message.to}]}],
            "from": {"email": settings.DEFAULT_FROM_EMAIL},
            "subject": message.subject,
            "content": [{"type": "text/plain", "value": message.body}],
        }
        status = self.transport(  # type: ignore[operator]
            self.ENDPOINT,
            {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json.dumps(payload).encode(),
        )
        if status not in (200, 202):
            raise EmailDeliveryError(f"SendGrid rejected the message ({status})")


def get_email_provider() -> EmailProvider:
    """Resolve the configured provider.

    ``EMAIL_PROVIDER`` forces a driver (``console`` / ``sendgrid``); when it
    is empty, SendGrid is used only if ``SENDGRID_API_KEY`` is configured,
    otherwise the console driver (A2: empty key ⇒ console).
    """
    choice = getattr(settings, "EMAIL_PROVIDER", "").strip().lower()
    if not choice:
        choice = "sendgrid" if getattr(settings, "SENDGRID_API_KEY", "") else "console"
    if choice == "sendgrid":
        return SendGridEmailProvider()
    return ConsoleEmailProvider()
