"""M4 D3 — club showcase pins (BRIEF_M4 §5: W4 + public-safe page).

* **W4 slug rules** — reserved words blocked (case/variant) · collision-safe
  slugs · impersonation slugs rejected · blocklist enforced AT WRITE.
* **Public-safe page** — the showcase publishes identity + roster COUNTS
  only (M4-A2/P0): zero student PII on any public path, byte-checked here.
* **Read-only public surface** — everyone can read; only club authorities
  can write (the W9 matrix lives in ``test_m4_d3_authz.py``).
"""
from __future__ import annotations

from typing import Any

from apps.clubs import slugs
from apps.clubs.models import ClubShowcase
from apps.clubs.slugs import SlugBlockedError
from apps.domain.models import Club, Institution, Membership

from .m2_support import build_zone_graph
from .support import Category, SubRole, make_user
from .support import M1PinTestCase as TestCase


def make_club(
    state: Any,
    *,
    tag: str,
    institution_name: str,
    club_name: str,
) -> tuple[Institution, Club]:
    """One institution + club with unique codes and names as given."""
    institution = Institution.objects.create(
        code=f"INST-{tag}",
        legacy_id=f"LEG-{tag}",
        name=institution_name,
        state=state,
    )
    club = Club.objects.create(
        code=f"CLB-{tag}", institution=institution, name=club_name
    )
    return institution, club


def make_club_admin(
    username: str, club: Club, *, category: str = Category.CLUB_ADMIN, **kwargs: Any
) -> Any:
    """One account scoped to ``club`` (authority by default)."""
    return make_user(
        username=username,
        category=category,
        sub_role=SubRole.CLUB_PRESIDENT,
        institution_code=club.institution.code,
        club_code=club.code,
        state_code=club.institution.state.code,
        zone_code=club.institution.state.zone.code,
        **kwargs,
    )


class SlugRulesTests(TestCase):
    """W4 — the reserved-words blocklist, at every case/variant."""

    def test_w4_reserved_words_blocked_in_every_case(self) -> None:
        for slug in (
            "admin",
            "ADMIN",
            "aDmIn",
            "api",
            "verify",
            "static",
            "login",
            "signup",
            "health",
            "robots",
            "sitemap",
            "dashboard",
            "join",
        ):
            with self.subTest(slug=slug):
                with self.assertRaises(SlugBlockedError):
                    slugs.validate_slug(slug)

    def test_w4_punctuation_variants_are_blocked_too(self) -> None:
        # "log-in" / "log_in" / "Log.In" / "log--in" all claim "login";
        # "sign-up" claims "signup" across a word boundary.
        for slug in ("login", "log-in", "log_in", "LOG-IN", "log.in", "log--in"):
            with self.subTest(slug=slug):
                with self.assertRaises(SlugBlockedError):
                    slugs.validate_slug(slug)
        for slug in ("signup", "sign-up", "Sign_Up", "sign.up"):
            with self.subTest(slug=slug):
                with self.assertRaises(SlugBlockedError):
                    slugs.validate_slug(slug)

    def test_w4_impersonation_slugs_rejected(self) -> None:
        for slug in (
            "iit-sample-official-club",
            "the-helpdesk-team",
            "ndli-admin-desk",
            "superadmin-society",
            "webmaster-corner",
        ):
            with self.subTest(slug=slug):
                with self.assertRaises(SlugBlockedError):
                    slugs.validate_slug(slug)

    def test_w4_profanity_slugs_rejected(self) -> None:
        for slug in ("damn-shit-show", "the-bitch-club"):
            with self.subTest(slug=slug):
                with self.assertRaises(SlugBlockedError):
                    slugs.validate_slug(slug)

    def test_w4_derived_slug_combines_institution_and_club(self) -> None:
        graph = build_zone_graph()
        club = graph["NORTH"]["club"]
        club.name = "Robotics Club"
        club.save(update_fields=["name"])
        derived = slugs.derive_slug(club.institution.name, club.name)
        self.assertEqual(derived, "delhi-sample-institution-robotics-club")

    def test_w4_colliding_slugs_get_numeric_suffixes(self) -> None:
        graph = build_zone_graph()
        state = graph["NORTH"]["state"]
        _first_inst, first = make_club(
            state, tag="T1", institution_name="Twin Institute", club_name="Twin Club"
        )
        _second_inst, second = make_club(
            state, tag="T2", institution_name="Twin Institute", club_name="Twin Club"
        )
        taken: set[str] = set()
        first_slug = slugs.derive_slug(
            first.institution.name, first.name, taken=taken
        )
        taken.add(first_slug)
        second_slug = slugs.derive_slug(
            second.institution.name, second.name, taken=taken
        )
        self.assertEqual(first_slug, "twin-institute-twin-club")
        self.assertEqual(second_slug, "twin-institute-twin-club-2")

    def test_w4_the_model_refuses_a_blocked_slug_on_every_write(self) -> None:
        graph = build_zone_graph()
        club = graph["NORTH"]["club"]
        with self.assertRaises(SlugBlockedError):
            ClubShowcase.objects.create(club=club, slug="admin")


class ShowcaseWriteTests(TestCase):
    """Showcase create/edit through the dashboard (club authority)."""

    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.club = self.graph["NORTH"]["club"]
        self.admin = make_club_admin("d3showadmin", self.club)
        self.client.force_login(self.admin)

    def _post(self, **fields: Any) -> Any:
        return self.client.post(
            "/api/v1/clubs/dashboard/showcase/",
            data=fields,
            content_type="application/json",
        )

    def test_showcase_create_and_edit_persists_identity_and_sections(self) -> None:
        created = self._post(
            tagline="We build robots.",
            about="The robotics club of Delhi sample institution.",
            sections=[{"heading": "About us", "body": "Robots since 2020."}],
        )
        self.assertEqual(created.status_code, 200, created.content)
        body = created.json()
        self.assertEqual(body["slug"], "delhi-sample-institution-delhi-sample-club")
        self.assertEqual(body["sections"][0]["heading"], "About us")

        edited = self._post(
            tagline="We build better robots.",
            about="Still robots.",
            sections=[
                {"heading": "About us", "body": "Robots since 2020."},
                {"heading": "Awards", "body": "Won some."},
            ],
        )
        self.assertEqual(edited.status_code, 200, edited.content)
        self.assertEqual(len(edited.json()["sections"]), 2)
        showcase = ClubShowcase.objects.get(club=self.club)
        self.assertEqual(showcase.tagline, "We build better robots.")
        # W4: the slug is derived ONCE and survives every edit.
        self.assertEqual(showcase.slug, "delhi-sample-institution-delhi-sample-club")

    def test_w4_blocked_derivation_refuses_the_write_at_write_time(self) -> None:
        self.club.name = "Admin Club"
        self.club.save(update_fields=["name"])
        response = self._post(tagline="x", about="y")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "slug_blocked")
        self.assertFalse(ClubShowcase.objects.filter(club=self.club).exists())

    def test_oversized_sections_are_refused(self) -> None:
        response = self._post(
            tagline="x",
            about="y",
            sections=[{"heading": "h", "body": "z" * 2001}],
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "section_too_long")


class PublicShowcaseTests(TestCase):
    """The public page: read-only for everyone, aggregates only (M4-A2/P0)."""

    def setUp(self) -> None:
        super().setUp()
        self.graph = build_zone_graph()
        self.club = self.graph["NORTH"]["club"]
        self.admin = make_club_admin("d3pubadmin", self.club)

    def _publish(self) -> str:
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/v1/clubs/dashboard/showcase/",
            data={
                "tagline": "We build robots.",
                "about": "Public about text.",
                "sections": [{"heading": "About us", "body": "Robots."}],
            },
            content_type="application/json",
        )
        assert response.status_code == 200, response.content
        self.client.logout()
        return response.json()["slug"]

    def test_unknown_slug_is_404_never_data(self) -> None:
        self._publish()
        response = self.client.get("/api/v1/clubs/showcase/nowhere/")
        self.assertEqual(response.status_code, 404)
        self.assertNotIn("club", response.json())

    def test_public_payload_is_aggregates_only_zero_pii(self) -> None:
        slug = self._publish()
        # Roster + a pending join carrying obvious PII that must never leak.
        member = make_user(
            username="d3memberleak",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            email="member.leak@example.test",
            phone="+911234500009",
        )
        Membership.objects.create(user=member, club=self.club)
        from apps.members.models import JoinRequest

        pending = make_user(
            username="d3pendingleak",
            category=Category.STUDENT_MEMBER,
            sub_role=SubRole.STUDENT_MEMBER,
            email="pending.leak@example.test",
        )
        JoinRequest.objects.create(user=pending, club=self.club)

        response = self.client.get(f"/api/v1/clubs/showcase/{slug}/")
        self.assertEqual(response.status_code, 200)
        body = response.content.decode("utf-8")
        for marker in (
            "@",  # no email-shaped text at all
            "d3memberleak",
            "member.leak",
            "d3pendingleak",
            "pending.leak",
            "+911234500009",
        ):
            with self.subTest(marker=marker):
                self.assertNotIn(marker, body)
        roster = response.json()["roster"]
        self.assertEqual(roster["members_total"], 1)
        self.assertEqual(roster["members_active"], 1)
        self.assertEqual(roster["alumni"], 0)

    def test_public_index_lists_published_showcases_only(self) -> None:
        slug = self._publish()
        other = self.graph["WEST"]["club"]
        response = self.client.get("/api/v1/clubs/showcase/")
        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        self.assertEqual([row["slug"] for row in results], [slug])
        self.assertNotIn(other.code, response.content.decode("utf-8"))

    def test_public_pages_are_read_only_for_everyone(self) -> None:
        slug = self._publish()
        self.client.logout()
        # Anonymous reads work (public by design) ...
        read = self.client.get(f"/api/v1/clubs/showcase/{slug}/")
        self.assertEqual(read.status_code, 200)
        # ... but nobody outside the dashboard may write through the public
        # surface: the write lives ONLY on the W9-gated route.
        for path in (
            f"/api/v1/clubs/showcase/{slug}/",
            "/api/v1/clubs/showcase/",
        ):
            with self.subTest(path=path):
                response = self.client.post(
                    path, data={"tagline": "x"}, content_type="application/json"
                )
                self.assertIn(response.status_code, (401, 403, 405))
