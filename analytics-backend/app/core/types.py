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
