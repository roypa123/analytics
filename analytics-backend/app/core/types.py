"""Shared type aliases. No enums (Part 0 F-03 mirror — CHECK constraints and
literal unions instead, kept consistent with the frontend's erasableSyntaxOnly
constraint on the same value sets)."""

from typing import Literal, NewType

AccountId = NewType("AccountId", int)
WorkspaceId = NewType("WorkspaceId", int)
PropertyId = NewType("PropertyId", int)

WorkspaceRole = Literal["owner", "admin", "member"]
PropertyRole = Literal["admin", "analyst", "viewer"]

WORKSPACE_ROLES: tuple[WorkspaceRole, ...] = ("owner", "admin", "member")
PROPERTY_ROLES: tuple[PropertyRole, ...] = ("admin", "analyst", "viewer")

# Part 1 §1.2 Tier 1 breakdown dimensions. Mirrors the frontend's
# `REPORT_DIMENSIONS` (analytics-frontend/src/routing/search-validators.ts)
# by hand, the same way the role sets above mirror `core.*` CHECK constraints
# — R-14, independent validation on both sides of the wire.
ReportDimension = Literal[
    "pages", "referrers", "sources", "locations", "devices", "browsers", "os"
]
REPORT_DIMENSIONS: tuple[ReportDimension, ...] = (
    "pages", "referrers", "sources", "locations", "devices", "browsers", "os",
)
