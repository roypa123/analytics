"""Part 8 §8.4, §8.8 — the wire contract for registration, login, and
session refresh."""

from pydantic import EmailStr, Field

from app.schemas.common import CamelModel


class RegisterRequest(CamelModel):
    email: EmailStr
    password: str = Field(min_length=12)
    full_name: str = Field(min_length=1, max_length=200)


class LoginRequest(CamelModel):
    email: EmailStr
    password: str


class MfaChallengeResponse(CamelModel):
    mfa_required: bool = True
    mfa_pending_token: str


class AccessTokenResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class AccountSummary(CamelModel):
    id: int
    email: str
    full_name: str
    email_verified: bool
