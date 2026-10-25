"""Root URL configuration.

The API lives under /api/ on the same origin as the frontend (spec section 1:
single origin). OpenAPI schema and interactive docs are exposed under /api/;
health endpoints are at /health/ and /health/ready/ for probes and the
readiness gate (infra/nginx.conf, docker-compose healthchecks, CI smoke tests).
"""
from django.contrib import admin
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core import frontend as core_frontend
from apps.core import views as core_views

API_URLPATTERNS = [
    path("accounts/", include("apps.accounts.urls")),
    path("onboarding/", include("apps.onboarding.urls")),
    path("institutions/", include("apps.institutions.urls")),
    path("clubs/", include("apps.clubs.urls")),
    path("members/", include("apps.members.urls")),
    path("activities/", include("apps.activities.urls")),
    path("certificates/", include("apps.certificates.urls")),
    path("analytics-reports/", include("apps.analytics_reports.urls")),
    path("sharing/", include("apps.sharing.urls")),
    path("succession/", include("apps.succession.urls")),
    path("grievances/", include("apps.grievances.urls")),
    path("notifications/", include("apps.notifications.urls")),
    path("audit/", include("apps.audit.urls")),
    path("public/", include("apps.public_api.urls")),
]

urlpatterns = [
    # M6 D2 charter desk lives BEHIND the admin door (M1 T3 gate:
    # admin-module routes must be under /admin/).
    path("admin/api/v1/governance/", include("apps.governance.urls")),
    path(
        "admin/api/v1/dashboards/",
        include("apps.analytics_reports.urls_admin"),
    ),
    path("admin/api/v1/grievances/", include("apps.grievances.urls_admin")),
    # M6 D5 stage 3: the guarded red-zone hard reset. Mounted under /admin/
    # like every other admin-module route, and BEFORE admin.site.urls so the
    # API prefix is never shadowed.
    path("admin/api/v1/data/", include("apps.data_admin.urls")),
    path("admin/", admin.site.urls),
    # Health probes: liveness and readiness.
    path("health/", core_views.liveness, name="health-liveness"),
    path("health/ready/", core_views.readiness, name="health-readiness"),
    # OpenAPI schema (JSON/YAML) and interactive documentation.
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        # M4H: CSP-clean template (vendored swagger-ui, external init script).
        # The stock drf-spectacular page needs cdn.jsdelivr.net + inline JS,
        # both blocked by the P0 script-src 'self' policy (blank page bug).
        SpectacularSwaggerView.as_view(
            url_name="schema", template_name="core/api_docs.html"
        ),
        name="schema-swagger-ui",
    ),
    # Versioned API surface; each bounded context mounts its own routes.
    path("api/v1/", include((API_URLPATTERNS, "api"))),
    # Collected admin static files (P0: path-contained serving).
    path("static/<path:path>", core_frontend.serve_static, name="static-root"),
    # M3-A6 single-origin: everything else is the built frontend. The catch-all
    # is parameterised (and last) so it never shadows /api/, /admin/, /health/.
    re_path(r"^(?P<path>.*)$", core_frontend.serve_frontend, name="spa"),
]
