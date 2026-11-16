from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .storage import DocId, doc_dir, read_json, write_json

router = APIRouter(prefix="/annotations", tags=["annotations"])

Severity = Literal["Consider", "Should fix", "Must fix", "Praise"]


class Rect(BaseModel):
    """PDF points, top-left origin (PyMuPDF and pdf.js viewport at scale 1 agree on this)."""

    x0: float
    y0: float
    x1: float
    y1: float


class Annotation(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    number: int = 0
    page: int = Field(ge=1)
    rects: list[Rect] = Field(min_length=1)
    text: str = Field(max_length=20_000)
    comment: str = Field(default="", max_length=20_000)
    severity: Severity


def reading_order(a: Annotation) -> tuple:
    first = min(a.rects, key=lambda r: (round(r.y0), r.x0))
    return (a.page, round(first.y0), first.x0)


def renumber(items: list[Annotation]) -> list[Annotation]:
    ordered = sorted(items, key=reading_order)
    return [a.model_copy(update={"number": i}) for i, a in enumerate(ordered, 1)]


def load(doc_id: str) -> list[Annotation]:
    return [Annotation(**a) for a in read_json(doc_dir(doc_id) / "annotations.json", [])]


@router.get("/{doc_id}")
def get_annotations(doc_id: DocId) -> list[Annotation]:
    return load(doc_id)


@router.put("/{doc_id}")
def put_annotations(doc_id: DocId, body: list[Annotation]) -> list[Annotation]:
    d = doc_dir(doc_id)
    pages = read_json(d / "meta.json", {}).get("pages", 0)
    if bad := [a.id for a in body if a.page > pages]:
        raise HTTPException(422, f"annotation(s) {bad} point past the last page ({pages})")
    if len({a.id for a in body}) != len(body):
        raise HTTPException(422, "duplicate annotation ids")
    saved = renumber(body)
    write_json(d / "annotations.json", [a.model_dump() for a in saved])
    return saved
