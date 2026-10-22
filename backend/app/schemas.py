"""Request bodies (validated at the API boundary)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Lat = Field(default=None, ge=-90, le=90)
Lon = Field(default=None, ge=-180, le=180)


class AssistIn(BaseModel):
    message: str = Field(min_length=1, max_length=400)
    fast: bool = False  # rules only (instant), the client then refines with the LLM call


class RecommendIn(BaseModel):
    need: str = Field(min_length=1, max_length=600)
    product_ids: list[str] = Field(min_length=1, max_length=8)
    lat: float | None = Lat
    lon: float | None = Lon


QuestionKey = Literal["stock", "price", "installment", "warranty", "color", "hours", "hold"]


class InquiryIn(BaseModel):
    client_id: str = Field(min_length=4, max_length=64)
    product_id: str = Field(min_length=1, max_length=64)
    offer_ids: list[str] = Field(min_length=1, max_length=8)
    questions: list[QuestionKey] = []
    visit_at: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=300)
    lat: float | None = Lat
    lon: float | None = Lon


class ReplyIn(BaseModel):
    available: bool
    price: int | None = Field(default=None, ge=0, le=100_000_000_000)
    hold_until: str | None = Field(default=None, max_length=40)
    installment: str | None = Field(default=None, max_length=120)
    warranty: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=300)


SortKey = Literal["best", "price", "distance", "fresh"]
