import re
import secrets
from datetime import UTC, datetime

import pymupdf
from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import constants
from .storage import DocId, doc_dir, docs_root, pdf_path, read_json, write_json

router = APIRouter(prefix="/documents", tags=["documents"])


OCR_DPI = 300


class DocumentMeta(BaseModel):
    id: str
    name: str
    stem: str
    pages: int
    scanned: bool
    uploaded: str
    ocr: bool = False


def safe_stem(filename: str) -> str:
    stem = re.sub(r"\.pdf$", "", filename or "", flags=re.IGNORECASE)
    stem = re.sub(r"[^\w.-]+", "_", stem).strip("._")
    return stem[:80] or "document"


def is_scanned(doc: pymupdf.Document) -> bool:
    return not any(page.get_text().strip() for page in doc)


@router.post("", status_code=201)
async def upload(file: UploadFile) -> DocumentMeta:
    data = await file.read(constants.MAX_UPLOAD_BYTES + 1)
    if len(data) > constants.MAX_UPLOAD_BYTES:
        raise HTTPException(413, "PDF is larger than 200 MB")
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except (pymupdf.FileDataError, pymupdf.EmptyFileError, RuntimeError):
        raise HTTPException(422, "That file is not a readable PDF") from None
    if doc.page_count == 0:
        raise HTTPException(422, "That PDF has no pages")
    meta = DocumentMeta(
        id=secrets.token_urlsafe(6),
        name=file.filename or "document.pdf",
        stem=safe_stem(file.filename or ""),
        pages=doc.page_count,
        scanned=is_scanned(doc),
        uploaded=datetime.now(UTC).isoformat(),
    )
    d = docs_root() / meta.id
    d.mkdir(parents=True)
    (d / "original.pdf").write_bytes(data)
    write_json(d / "meta.json", meta.model_dump())
    return meta


@router.get("")
def list_documents() -> list[DocumentMeta]:
    root = docs_root()
    metas = [read_json(p, None) for p in root.glob("*/meta.json")] if root.exists() else []
    return sorted((DocumentMeta(**m) for m in metas if m), key=lambda m: m.uploaded, reverse=True)


@router.get("/{doc_id}")
def get_document(doc_id: DocId) -> DocumentMeta:
    return DocumentMeta(**read_json(doc_dir(doc_id) / "meta.json", {}))


@router.get("/{doc_id}/file")
def get_file(doc_id: DocId) -> FileResponse:
    return FileResponse(pdf_path(doc_id), media_type="application/pdf")


def ocr_pdf(src: pymupdf.Document) -> pymupdf.Document:
    """Rasterize each page and let Tesseract add an invisible text layer; page sizes are unchanged."""
    out = pymupdf.open()
    for page in src:
        scanned_page = pymupdf.open("pdf", page.get_pixmap(dpi=OCR_DPI).pdfocr_tobytes(language="eng"))
        # pixel rounding makes the OCR page a fraction of a point off; fit it to the exact original size
        target = out.new_page(width=page.rect.width, height=page.rect.height)
        target.show_pdf_page(target.rect, scanned_page, 0)
    return out


@router.post("/{doc_id}/ocr")
def ocr(doc_id: DocId) -> DocumentMeta:
    """Writes working.pdf beside the untouched original; viewer, read-aloud and export then use it."""
    d = doc_dir(doc_id)
    try:
        result = ocr_pdf(pymupdf.open(d / "original.pdf"))
    except RuntimeError as e:
        raise HTTPException(503, f"OCR failed. Is Tesseract installed (brew install tesseract)? {e}") from e
    result.save(d / "working.pdf", garbage=1, deflate=True)
    (d / "sentences.json").unlink(missing_ok=True)  # rebuilt from the new text layer
    meta = DocumentMeta(**read_json(d / "meta.json", {})).model_copy(
        update={"scanned": is_scanned(result), "ocr": True}
    )
    write_json(d / "meta.json", meta.model_dump())
    return meta
