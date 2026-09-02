"""Part 4 §4.10 — the shared response/error envelope."""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Wire format is camelCase (matches the frontend's `types/api/*`,
    Part 7 §7.13); Python code still reads/writes snake_case attributes."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ResponseMeta(CamelModel):
    request_id: str | None = None


class Envelope[T](CamelModel):
    data: T
    meta: ResponseMeta = ResponseMeta()


class ErrorDetail(CamelModel):
    field: str | None = None
    issue: str


class ErrorBody(CamelModel):
    code: str
    message: str
    details: list[ErrorDetail] = []
    request_id: str | None = None


class ErrorResponse(CamelModel):
    error: ErrorBody


class Page[T](CamelModel):
    items: list[T]
    total: int
    limit: int
    offset: int
