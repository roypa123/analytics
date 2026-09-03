"""Part 2 §2.3 — the public, unauthenticated ingest deployable.

Deliberately a separate ASGI app from app.api.main: no auth middleware (a
database lookup here would sit on the 10k-events/sec hot path — Part 8 §8.5),
permissive CORS, and no dependency on report-query health.

Phase 1 of the pipeline (docs/architecture/05-ingestion-pipeline.md): every
step in Part 2 §2.4 runs synchronously per request — no in-process batch
buffer, no Redis Stream, no `COPY`. `IngestionService.ingest` never raises for
an expected drop (unknown tracking id, bot, duplicate); this handler also
swallows genuinely unexpected exceptions, because Part 2 §2.5's response-code
policy is unconditional: a stranger's tracking script must never see anything
but 204 for a normal request. Prometheus counters
(`collector_events_dropped_total{reason=...}`) are Part 10 (Operations,
still pending) — structured log events stand in for now.
"""

from pathlib import Path

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.core.database import get_database
from app.core.redis import get_redis
from app.repositories.realtime_repo import RealtimeRepository
from app.schemas.event import CollectorEventRequest
from app.services.ingestion_service import IngestionService

logger = structlog.get_logger(__name__)

_TRACKER_JS_PATH = Path(__file__).parent / "static" / "tracker.js"


def _client_ip(request: Request) -> str:
    client = request.client
    return client.host if client is not None else "0.0.0.0"


def create_app() -> FastAPI:
    app = FastAPI(title="Analytics Collector", version="0.1.0")

    # Permissive by design: the caller is a tracking script on a stranger's
    # site (Part 2 §2.5) — origin cannot be allowlisted in advance.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["POST", "GET"],
        allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> Response:
        # Part 2 §2.5: "Malformed payload -> 204 (counted and sampled to
        # logs)" — a stranger's browser cannot act on a 422.
        logger.info("collector_dropped", reason="malformed_payload", errors=exc.errors())
        return Response(status_code=204)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/tracker.js")
    async def tracker_js() -> FileResponse:
        # There is no real CDN yet (Part 2 §2.3) — the collector, already the
        # public unauthenticated surface, serves the canonical script
        # directly. The onboarding snippet (install-snippet-page.tsx) embeds
        # this exact URL, so this is the file real installs load.
        return FileResponse(_TRACKER_JS_PATH, media_type="text/javascript")

    @app.post("/event", status_code=204)
    async def collect_event(payload: CollectorEventRequest, request: Request) -> Response:
        settings = get_settings()
        user_agent = request.headers.get("user-agent", "")
        client_ip = _client_ip(request)
        try:
            db = get_database(settings)
            realtime_repo = RealtimeRepository(get_redis(settings))
            async with db.write_session() as session:
                service = IngestionService(session, realtime_repo, settings)
                await service.ingest(payload, client_ip=client_ip, user_agent=user_agent)
        except Exception:
            logger.exception("collector_ingest_failed")
        return Response(status_code=204)

    return app


app = create_app()
