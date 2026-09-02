"""The AppError hierarchy — Part 4 §4.11.

Services raise these. Routers never construct HTTPException for expected
conditions; a single exception handler (see app/api/middleware/error_handler.py)
translates AppError into the Part 4 §4.10 response envelope.
"""

from typing import Any


class AppError(Exception):
    code: str = "internal_error"
    status: int = 500

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status: int | None = None,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status is not None:
            self.status = status
        self.details = details or []


class ValidationError(AppError):
    code = "validation_error"
    status = 422


class AuthenticationError(AppError):
    code = "authentication_error"
    status = 401


class AuthorizationError(AppError):
    code = "authorization_error"
    status = 403


class NotFoundError(AppError):
    code = "not_found"
    status = 404


class ConflictError(AppError):
    code = "conflict"
    status = 409


class RateLimitError(AppError):
    code = "rate_limited"
    status = 429


class QuotaExceededError(AppError):
    code = "quota_exceeded"
    status = 402


class UpstreamError(AppError):
    code = "upstream_error"
    status = 502


class LastOwnerError(ConflictError):
    """Part 8 §8.3, Rule R-06 — a workspace must always retain one owner."""

    code = "last_owner"
