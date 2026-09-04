"""Part 1 §1.5, Part 3 §3.2 — the wire contract for creating and listing
properties."""

from pydantic import Field

from app.core.types import PropertyRole
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
    # Part 8 §8.6's property-scoped matrix — "admin" for a workspace
    # owner/admin (rule 1's elevation) or the account's own `property_access`
    # grant otherwise. Drives component-level gating (e.g. a viewer can't see
    # the tracking snippet) the same way `WorkspaceSummary.my_role` does for
    # workspace-scoped UI.
    my_role: PropertyRole
