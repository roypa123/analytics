"""Password hashing and JWT encode/decode — Part 4 §4.8, Part 8 §8.4.

Argon2id over bcrypt (D-15): memory-hard, no 72-byte truncation gotcha.
Access tokens are short-lived EdDSA JWTs carrying only `sub`/`sid` (D-21) —
permissions are resolved per request, never embedded in the token.
"""

import time
import uuid
from dataclasses import dataclass

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import SecuritySettings

_hasher = PasswordHasher(memory_cost=19456, time_cost=2, parallelism=1)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


@dataclass(frozen=True)
class AccessTokenClaims:
    account_id: int
    session_id: str
    issued_at: int
    expires_at: int
    jti: str


def issue_access_token(account_id: int, session_id: str, settings: SecuritySettings) -> str:
    now = int(time.time())
    claims = {
        "sub": str(account_id),
        "sid": session_id,
        "iat": now,
        "exp": now + settings.access_token_ttl_minutes * 60,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(claims, settings.jwt_private_key, algorithm="EdDSA")


def decode_access_token(token: str, settings: SecuritySettings) -> AccessTokenClaims:
    payload = jwt.decode(token, settings.jwt_public_key, algorithms=["EdDSA"])
    return AccessTokenClaims(
        account_id=int(payload["sub"]),
        session_id=payload["sid"],
        issued_at=payload["iat"],
        expires_at=payload["exp"],
        jti=payload["jti"],
    )
