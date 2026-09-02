"""Part 1 §1.5, Part 3 §3.2 — the wire contract for creating and listing
properties."""

from pydantic import Field

from app.schemas.common import CamelModel


class CreatePropertyRequest(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    domain: str = Field(min_length=1, max_length=255)


class PropertySummary(CamelModel):
    id: int
    name: str
    domain: str
    tracking_id: str
    timezone: str
