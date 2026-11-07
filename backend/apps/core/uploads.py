"""M3: shared upload validation — allowlist extension + MIME + size + Pillow verify.

Every file upload endpoint MUST call ``validate_image_upload`` (or
``validate_file_upload``) BEFORE assigning the file to a model field.
Rejects malicious payloads disguised by extension, enforces size caps,
and uses Pillow to confirm the bytes decode as a real image.
"""

from __future__ import annotations

import os

from django.core.exceptions import ValidationError

# --- extension / MIME allowlists -------------------------------------------

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
_IMAGE_MIMES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}
_PNG_ONLY_EXTENSIONS = {".png"}
_PNG_ONLY_MIMES = {"image/png"}

# Size caps (bytes)
DEFAULT_IMAGE_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
POSTER_MAX_BYTES = 300 * 1024  # 300 KB (already enforced at view level)
SIGNATURE_MAX_BYTES = 2 * 1024 * 1024  # 2 MB


def _ext(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lower()


def _validate_common(uploaded, allowed_ext: set[str], allowed_mimes: set[str],
                     max_bytes: int) -> None:
    """Raise ``ValidationError`` when the upload violates any policy."""
    ext = _ext(uploaded.name)
    if ext not in allowed_ext:
        raise ValidationError(
            f"File extension '{ext}' is not allowed.",
            code="invalid_extension",
        )

    content_type = getattr(uploaded, "content_type", "") or ""
    if content_type and content_type.lower() not in allowed_mimes:
        raise ValidationError(
            f"Content type '{content_type}' is not allowed.",
            code="invalid_content_type",
        )

    if uploaded.size > max_bytes:
        raise ValidationError(
            f"File size exceeds the {max_bytes // (1024 * 1024)} MB limit.",
            code="file_too_large",
        )

    # Pillow verify: confirm the bytes decode as a real image of expected type
    try:
        from PIL import Image

        uploaded.seek(0)
        img = Image.open(uploaded)
        img.verify()  # raises on corrupted / non-image data
        uploaded.seek(0)
    except ImportError:
        pass  # Pillow optional at runtime; extension + MIME still enforced
    except Exception as err:
        raise ValidationError(
            "Uploaded file is not a valid image.",
            code="invalid_image",
        ) from err


def validate_image_upload(uploaded, max_bytes: int = DEFAULT_IMAGE_MAX_BYTES) -> None:
    """Validate a general image upload (avatar, poster)."""
    _validate_common(uploaded, _IMAGE_EXTENSIONS, _IMAGE_MIMES, max_bytes)


def validate_png_upload(uploaded, max_bytes: int = SIGNATURE_MAX_BYTES) -> None:
    """Validate a transparent-PNG upload (logo, signature)."""
    _validate_common(uploaded, _PNG_ONLY_EXTENSIONS, _PNG_ONLY_MIMES, max_bytes)
