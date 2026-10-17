from django.apps import AppConfig


class MigrationSalvageConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.migration_salvage"
    verbose_name = "Migration Salvage"
