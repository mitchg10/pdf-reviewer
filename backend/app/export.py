import csv
from pathlib import Path
from typing import Literal

import pymupdf
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .annotations import Annotation, load
from .constants import SEVERITY_RGB
from .storage import DocId, doc_dir, pdf_path, read_json

router = APIRouter(prefix="/documents", tags=["export"])

CSV_HEADER = ["number", "original_text", "comment", "severity", "page"]


def note(a: Annotation) -> str:
    return f"#{a.number} {a.severity}: {a.comment}"


def write_csv(path: Path, items: list[Annotation], include_page: bool) -> None:
    header = CSV_HEADER if include_page else CSV_HEADER[:-1]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        for a in sorted(items, key=lambda a: a.number):
            row = [a.number, a.text, a.comment, a.severity, a.page]
            w.writerow(row if include_page else row[:-1])


def write_annotated_pdf(src: Path, dst: Path, items: list[Annotation]) -> None:
    """Highlights go on a copy; src is only ever opened for reading."""
    doc = pymupdf.open(src)
    for a in items:
        page = doc[a.page - 1]
        quads = [pymupdf.Rect(r.x0, r.y0, r.x1, r.y1).quad for r in a.rects]
        annot = page.add_highlight_annot(quads=quads)
        annot.set_colors(stroke=SEVERITY_RGB[a.severity])
        annot.set_info(content=note(a), title="Reviewer")
        annot.update()
    doc.save(dst, garbage=1, deflate=True)


def export_paths(doc_id: str) -> dict[str, Path]:
    d = doc_dir(doc_id)
    stem = read_json(d / "meta.json", {}).get("stem", "document")
    return {"pdf": d / f"{stem}.annotated.pdf", "csv": d / f"{stem}.comments.csv"}


@router.post("/{doc_id}/export")
def export(doc_id: DocId, include_page: bool = True) -> dict[str, str]:
    items = load(doc_id)
    paths = export_paths(doc_id)
    write_csv(paths["csv"], items, include_page)
    write_annotated_pdf(pdf_path(doc_id), paths["pdf"], items)
    return {kind: f"/documents/{doc_id}/export/{kind}" for kind in paths}


@router.get("/{doc_id}/export/{kind}")
def download(doc_id: DocId, kind: Literal["pdf", "csv"]) -> FileResponse:
    path = export_paths(doc_id)[kind]
    if not path.exists():
        raise HTTPException(404, "not exported yet")
    media = "application/pdf" if kind == "pdf" else "text/csv"
    return FileResponse(path, media_type=media, filename=path.name)
