import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("KEEL_SECRET_KEY", "dev-only-not-a-secret")
DEBUG = os.environ.get("KEEL_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get("KEEL_ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "engine",
    "demo",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
]

CORS_ALLOW_ALL_ORIGINS = os.environ.get("KEEL_CORS_ALL", "1") == "1"
CORS_ALLOWED_ORIGINS = [
    o for o in os.environ.get("KEEL_CORS_ORIGINS", "http://localhost:3000").split(",") if o
]

ROOT_URLCONF = "keel.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
            ],
        },
    },
]

WSGI_APPLICATION = "keel.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("KEEL_DB_NAME", "keel"),
        "USER": os.environ.get("KEEL_DB_USER", os.environ.get("USER", "postgres")),
        "PASSWORD": os.environ.get("KEEL_DB_PASSWORD", ""),
        "HOST": os.environ.get("KEEL_DB_HOST", "localhost"),
        "PORT": os.environ.get("KEEL_DB_PORT", "5432"),
        "CONN_MAX_AGE": 0,
        "TEST": {"NAME": os.environ.get("KEEL_TEST_DB_NAME", "keel_test")},
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

USE_TZ = True
TIME_ZONE = "UTC"

STATIC_URL = "static/"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["engine.permissions.ReadOnlyDemo"],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.LimitOffsetPagination",
    "PAGE_SIZE": 50,
}

KEEL = {
    "LEASE_SECONDS": int(os.environ.get("KEEL_LEASE_SECONDS", "30")),
    "HEARTBEAT_SECONDS": int(os.environ.get("KEEL_HEARTBEAT_SECONDS", "5")),
    "POLL_INTERVAL_SECONDS": float(os.environ.get("KEEL_POLL_INTERVAL", "0.25")),
    "POLL_IDLE_MAX_SECONDS": float(os.environ.get("KEEL_POLL_IDLE_MAX", "2.0")),
    "RETRY_BASE_SECONDS": float(os.environ.get("KEEL_RETRY_BASE", "1.0")),
    "RETRY_MAX_SECONDS": float(os.environ.get("KEEL_RETRY_MAX", "300")),
    "RETRY_JITTER": float(os.environ.get("KEEL_RETRY_JITTER", "0.3")),
    "OUTBOX_BATCH": int(os.environ.get("KEEL_OUTBOX_BATCH", "100")),
    "OUTBOX_SINK": os.environ.get("KEEL_OUTBOX_SINK", "engine.sinks.FileSink"),
    "OUTBOX_SINK_PATH": os.environ.get("KEEL_OUTBOX_SINK_PATH", str(BASE_DIR / "var" / "published.jsonl")),
    "WORKER_STALE_SECONDS": int(os.environ.get("KEEL_WORKER_STALE_SECONDS", "60")),
    "CHAOS_RECORDING_PATH": os.environ.get(
        "KEEL_CHAOS_RECORDING", str(BASE_DIR / "var" / "chaos" / "latest.json")
    ),
    "CHAOS_SAMPLE_PATH": os.environ.get(
        "KEEL_CHAOS_SAMPLE", str(BASE_DIR / "web" / "public" / "chaos" / "sample.json")
    ),
    "READONLY": os.environ.get("KEEL_READONLY", "0") == "1",
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "keel": {"format": "%(asctime)s %(levelname)-7s %(name)-22s %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "keel"},
    },
    "root": {"handlers": ["console"], "level": os.environ.get("KEEL_LOG_LEVEL", "INFO")},
    "loggers": {
        "django.db.backends": {"level": "WARNING", "handlers": ["console"], "propagate": False},
    },
}
