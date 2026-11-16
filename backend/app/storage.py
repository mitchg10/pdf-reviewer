"""On-disk layout: DATA_DIR/documents/{id}/ holds original.pdf, meta.json, annotations.json, exports."""

import json
import os
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import HTTPException
from fastapi import Path as PathParam

from . import constants

DocId = Annotated[str, PathParam(pattern=constants.DOC_ID_RE)]


def docs_root() -> Path:
    return constants.DATA_DIR / "documents"


def doc_dir(doc_id: str) -> Path:
    d = docs_root() / doc_id
    if not (d / "meta.json").exists():
        raise HTTPException(404, f"document '{doc_id}' not found")
    return d


def pdf_path(doc_id: str) -> Path:
    """OCR'd working copy if one exists, else the untouched original."""
    d = doc_dir(doc_id)
    working = d / "working.pdf"
    return working if working.exists() else d / "original.pdf"


def read_json(path: Path, default):
    return json.loads(path.read_text()) if path.exists() else default


def write_bytes_atomic(path: Path, data: bytes) -> None:
    """Atomic write so a crash mid-save never leaves a half-written file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


def write_json(path: Path, data) -> None:
    write_bytes_atomic(path, json.dumps(data, indent=2).encode())
