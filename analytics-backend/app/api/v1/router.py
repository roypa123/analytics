from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.properties import router as properties_router
from app.api.v1.realtime import router as realtime_router
from app.api.v1.reports import router as reports_router
from app.api.v1.workspace import router as workspace_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(properties_router)
api_router.include_router(realtime_router)
api_router.include_router(reports_router)
api_router.include_router(workspace_router)
