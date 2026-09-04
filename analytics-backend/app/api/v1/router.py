from fastapi import APIRouter, Depends

from app.api.deps import require_active_subscription
from app.api.v1.auth import router as auth_router
from app.api.v1.billing import router as billing_router
from app.api.v1.properties import router as properties_router
from app.api.v1.realtime import router as realtime_router
from app.api.v1.reports import router as reports_router
from app.api.v1.workspace import router as workspace_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(billing_router)
# Part 12 (revised: no free tier) — every property-scoped route requires an
# active subscription; auth and billing itself must not (you need to be able
# to reach the paywall in the first place). `workspace_router` is gated
# per-route instead of here, since `GET /workspaces`, `GET /workspaces/{id}`,
# and accepting an invitation must stay reachable regardless (app/api/v1/workspace.py).
api_router.include_router(
    properties_router, dependencies=[Depends(require_active_subscription)]
)
api_router.include_router(realtime_router, dependencies=[Depends(require_active_subscription)])
api_router.include_router(reports_router, dependencies=[Depends(require_active_subscription)])
api_router.include_router(workspace_router)
