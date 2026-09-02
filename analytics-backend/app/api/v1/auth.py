"""Part 4 §4.1, D-11 — the router IS the controller. Each handler is HTTP
concerns plus exactly one call into the service; no branching business logic
lives here (Part 4 §4.13 review checklist).
"""

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_account, get_write_session, hash_ip
from app.core.config import Settings, get_settings
from app.core.exceptions import AuthenticationError
from app.models.core.account import Account
from app.schemas.auth import AccessTokenResponse, AccountSummary, LoginRequest, RegisterRequest
from app.schemas.common import Envelope
from app.services.auth_service import AuthResult, AuthService

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"


def _set_refresh_cookie(response: Response, result: AuthResult, settings: Settings) -> None:
    # httpOnly + Secure + SameSite=Lax (Part 8 §8.4, D-20) — never exposed to
    # JS, so an XSS cannot exfiltrate a 30-day-lived credential.
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=result.refresh_token,
        httponly=True,
        secure=settings.environment != "local",
        samesite="lax",
        expires=result.refresh_expires_at,
        path="/api/v1/auth",
    )


def _account_summary(account: Account) -> AccountSummary:
    return AccountSummary(
        id=account.id,
        email=account.email,
        full_name=account.full_name,
        email_verified=account.email_verified_at is not None,
    )


@router.post("/register", response_model=Envelope[AccessTokenResponse])
async def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_settings),
) -> Envelope[AccessTokenResponse]:
    service = AuthService(session, settings.security)
    result = await service.register(
        email=body.email,
        password=body.password,
        full_name=body.full_name,
        user_agent=request.headers.get("User-Agent"),
        ip_hash=hash_ip(request),
    )
    _set_refresh_cookie(response, result, settings)
    return Envelope(
        data=AccessTokenResponse(
            access_token=result.access_token,
            expires_in=settings.security.access_token_ttl_minutes * 60,
        )
    )


@router.post("/login", response_model=Envelope[AccessTokenResponse])
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_settings),
) -> Envelope[AccessTokenResponse]:
    service = AuthService(session, settings.security)
    result = await service.login(
        email=body.email,
        password=body.password,
        user_agent=request.headers.get("User-Agent"),
        ip_hash=hash_ip(request),
    )
    _set_refresh_cookie(response, result, settings)
    return Envelope(
        data=AccessTokenResponse(
            access_token=result.access_token,
            expires_in=settings.security.access_token_ttl_minutes * 60,
        )
    )


@router.post("/refresh", response_model=Envelope[AccessTokenResponse])
async def refresh(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_settings),
) -> Envelope[AccessTokenResponse]:
    raw_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if raw_token is None:
        raise AuthenticationError("No refresh token presented.", code="no_session")

    service = AuthService(session, settings.security)
    result = await service.refresh(
        raw_refresh_token=raw_token,
        user_agent=request.headers.get("User-Agent"),
        ip_hash=hash_ip(request),
    )
    _set_refresh_cookie(response, result, settings)
    return Envelope(
        data=AccessTokenResponse(
            access_token=result.access_token,
            expires_in=settings.security.access_token_ttl_minutes * 60,
        )
    )


@router.post("/logout", status_code=204)
async def logout(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/api/v1/auth")


@router.get("/me", response_model=Envelope[AccountSummary])
async def me(account: Account = Depends(get_current_account)) -> Envelope[AccountSummary]:
    return Envelope(data=_account_summary(account))
