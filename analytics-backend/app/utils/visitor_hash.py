"""Part 1 §1.7, Part 2 §2.9 — the cookieless daily-rotating visitor hash.

D-08: the daily salt is derived via HKDF from a master secret plus
(property_id, local_date) rather than stored (in Redis or anywhere else).
Same privacy properties as a stored random salt — it still changes every
property-local day and cannot be joined across properties or across days —
but it is stateless: any replica can recompute today's salt with no shared
cache, and rotating `visitor_hash_secret` (quarterly, per D-08) makes every
salt derived from the old secret permanently unreconstructable.
"""

import hashlib
from datetime import date

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def derive_daily_salt(*, master_secret: str, property_id: int, local_date: date) -> bytes:
    info = f"{property_id}:{local_date.isoformat()}".encode()
    hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=info)
    return hkdf.derive(master_secret.encode())


def compute_visitor_hash(
    *, daily_salt: bytes, property_id: int, client_ip: str, user_agent: str
) -> bytes:
    """BLAKE2b-128 over salt || property_id || ip || UA (Part 1 §1.7). The IP
    and UA are consumed here and must not be persisted by the caller."""
    digest = hashlib.blake2b(digest_size=16)
    digest.update(daily_salt)
    digest.update(property_id.to_bytes(8, "big"))
    digest.update(client_ip.encode())
    digest.update(user_agent.encode())
    return digest.digest()
