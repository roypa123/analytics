"""Part 2 §2.3 — the authenticated API deployable. Separate ASGI app from
the collector (app.collector.main): different auth posture, different
scaling policy, different failure domain."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.middleware.error_handler import register_exception_handlers
from app.api.middleware.request_id import RequestIdMiddleware
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Analytics API", version="0.1.0", lifespan=lifespan)

    # localhost:5173 is always allowed outside production for local dev
    # convenience; anything beyond that (a deployed frontend's real origin —
    # a VPS IP, a real domain) must be listed explicitly via
    # CORS__ALLOWED_ORIGINS, since the browser enforces this regardless of
    # environment and there's no way to guess a deployment's origin in code.
    local_dev_origin = [] if settings.environment == "production" else ["http://localhost:5173"]

    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[*local_dev_origin, *settings.cors.origins],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    app.include_router(api_router)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
