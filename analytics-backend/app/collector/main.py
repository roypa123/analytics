"""Part 2 §2.3 — the public, unauthenticated ingest deployable.

Deliberately a separate ASGI app from app.api.main: no auth middleware (a
database lookup here would sit on the 10k-events/sec hot path — Part 8 §8.5),
permissive CORS, and no dependency on report-query health.

The full pipeline (validate → bot filter → dedup → enrich → session lookup →
buffer, Part 2 §2.4) is the subject of Part 5 (Ingestion Pipeline), not yet
detailed as a doc. This is the deployable's shape and the response-code
policy (Part 2 §2.5) wired up now so the two services are already deployed
and scaled independently; the pipeline body lands with Part 5.
"""

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from app.schemas.event import CollectorEventRequest


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

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/event", status_code=204)
    async def collect_event(payload: CollectorEventRequest) -> Response:
        # TODO(Part 5): validate → bot filter → dedup(Redis) → enrich(geo/UA)
        # → visitor_hash → session lookup → buffer.append() + XADD.
        # Per Part 2 §2.5, this endpoint returns 204 for nearly everything —
        # a stranger's browser cannot act on a 4xx, and a 5xx risks retry
        # amplification during an incident.
        return Response(status_code=204)

    return app


app = create_app()
