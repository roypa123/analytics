"""Part 8 §8.4, §8.8 — the wire contract for registration, login, and
session refresh."""

from pydantic import EmailStr, Field

from app.schemas.common import CamelModel


class RegisterRequest(CamelModel):
    email: EmailStr
    password: str = Field(min_length=12)
    full_name: str = Field(min_length=1, max_length=200)
    # Part 8 §8.1, §8.8, D-25 — the "Organisation" signup tab collects this;
    # the "Individual" tab omits it and the workspace is auto-named instead.
    organisation_name: str | None = Field(default=None, min_length=1, max_length=200)


class LoginRequest(CamelModel):
    email: EmailStr
    password: str
    # Part 8 §8.8, D-25 — sent only from the login page's "Organisation" tab.
    # When present, the account must hold a membership in a workspace with
    # this exact name, or the login is rejected even with correct credentials.
    organisation_name: str | None = Field(default=None, min_length=1, max_length=200)


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


class UpdateProfileRequest(CamelModel):
    full_name: str = Field(min_length=1, max_length=200)


class ChangePasswordRequest(CamelModel):
    current_password: str
    new_password: str = Field(min_length=12)
