"""H1 pins: X-Forwarded-For spoofing must not move a client's throttle key."""

from django.test import RequestFactory, TestCase

from apps.accounts.throttles import client_ip


class ClientIpTests(TestCase):
    def setUp(self) -> None:
        self.factory = RequestFactory()

    def test_direct_connection_ignores_spoofed_xff(self) -> None:
        req = self.factory.get("/", HTTP_X_FORWARDED_FOR="1.2.3.4")
        req.META["REMOTE_ADDR"] = "203.0.113.9"
        self.assertEqual(client_ip(req), "203.0.113.9")

    def test_trusted_proxy_uses_forwarded_client(self) -> None:
        req = self.factory.get("/", HTTP_X_FORWARDED_FOR="203.0.113.9")
        req.META["REMOTE_ADDR"] = "127.0.0.1"
        self.assertEqual(client_ip(req), "203.0.113.9")

    def test_trusted_proxy_takes_rightmost_hop(self) -> None:
        req = self.factory.get(
            "/", HTTP_X_FORWARDED_FOR="spoofed, also-spoofed, 203.0.113.9"
        )
        req.META["REMOTE_ADDR"] = "10.0.0.5"
        self.assertEqual(client_ip(req), "203.0.113.9")

    def test_untrusted_middlebox_is_ignored(self) -> None:
        req = self.factory.get("/", HTTP_X_FORWARDED_FOR="9.9.9.9")
        req.META["REMOTE_ADDR"] = "198.51.100.7"
        self.assertEqual(client_ip(req), "198.51.100.7")

    def test_no_xff_falls_back_to_remote_addr(self) -> None:
        req = self.factory.get("/")
        req.META["REMOTE_ADDR"] = "203.0.113.9"
        self.assertEqual(client_ip(req), "203.0.113.9")
