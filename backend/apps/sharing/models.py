"""Data models for the Sharing app (3-Tier Curated NDLI Libraries).

Strict content law: Only links from official NDLI portals (ndli.iitkgp.ac.in,
ndl.iitkgp.ac.in, www.ndl.gov.in) are allowed.
* Club Library: Created by Club Admins & Sub-Club Coordinators; read-only for members.
* Personal Library: Created by students for their own study.
* Community Library: Shared inter-club repository of student-contributed libraries.
"""

from __future__ import annotations

import re
from typing import ClassVar

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.domain.models import Club

ALLOWED_NDLI_HOSTS = (
    "ndli.iitkgp.ac.in",
    "ndl.iitkgp.ac.in",
    "www.ndl.gov.in",
    "ndl.gov.in",
)
NDLI_URL_REGEX = re.compile(
    r"^https?://([a-zA-Z0-9-]+\.)*(ndli\.iitkgp\.ac\.in|ndl\.iitkgp\.ac\.in|ndl\.gov\.in)(/.*)?$",
    re.IGNORECASE,
)


def validate_ndli_url(value: str) -> None:
    if not NDLI_URL_REGEX.match(value):
        raise ValidationError(
            "Only content links from official NDLI portals "
            "(ndli.iitkgp.ac.in, ndl.iitkgp.ac.in, or www.ndl.gov.in) allowed."
        )


class LibraryType(models.TextChoices):
    CLUB = "club", "Club Library"
    PERSONAL = "personal", "Personal Library"
    COMMUNITY = "community", "Community Library"


class CuratedLibrary(models.Model):
    """A topic-curated collection of NDLI resources."""

    club = models.ForeignKey(
        Club,
        on_delete=models.CASCADE,
        related_name="curated_libraries",
    )
    library_type = models.CharField(
        max_length=16,
        choices=LibraryType.choices,
        default=LibraryType.CLUB,
    )
    title = models.CharField(max_length=200)
    topic_category = models.CharField(max_length=128)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_libraries",
    )
    sub_club = models.ForeignKey(
        "domain.SubClub",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="curated_libraries",
    )
    is_published_to_community = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    SCOPE_LOOKUPS: ClassVar[dict[str, str]] = {
        "state": "club__institution__state__code",
        "zone": "club__institution__state__zone__code",
        "institution": "club__institution__code",
        "club": "club__code",
        "user": "owner",
    }

    class Meta:
        ordering = ["-updated_at", "title"]
        indexes = [
            models.Index(
                fields=["club", "library_type"], name="curatedlib_club_type_idx"
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.title} ({self.library_type})"


class CuratedResourceLink(models.Model):
    """One NDLI resource link inside a curated library."""

    library = models.ForeignKey(
        CuratedLibrary,
        on_delete=models.CASCADE,
        related_name="resources",
    )
    title = models.CharField(max_length=255)
    ndli_url = models.URLField(max_length=500, validators=[validate_ndli_url])
    topic_path = models.CharField(
        max_length=255, blank=True, default="", help_text="Topic subdirectory path"
    )
    description = models.TextField(blank=True, default="")
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["topic_path", "title"]
        indexes = [
            models.Index(
                fields=["library", "topic_path"], name="resource_lib_topic_idx"
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.title} -> {self.ndli_url}"
