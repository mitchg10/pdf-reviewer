import shutil

import pymupdf
import pytest

from app import documents


def scanned_pdf() -> bytes:
    """An image-only PDF: render real text to pixels, then wrap the picture in a new page."""
    text_doc = pymupdf.open()
    text_doc.new_page().insert_text((72, 120), "The sample was small.", fontsize=28)
    pix = text_doc[0].get_pixmap(dpi=200)
    scan = pymupdf.open()
    page = scan.new_page()
    page.insert_image(page.rect, pixmap=pix)
    return scan.tobytes()


@pytest.mark.skipif(not shutil.which("tesseract"), reason="tesseract not installed")
def test_ocr_adds_text_layer_and_keeps_original(client, data_dir):
    meta = client.post("/documents", files={"file": ("scan.pdf", scanned_pdf(), "application/pdf")}).json()
    assert meta["scanned"] is True
    d = data_dir / "documents" / meta["id"]
    original = (d / "original.pdf").read_bytes()

    after = client.post(f"/documents/{meta['id']}/ocr").json()
    assert (after["scanned"], after["ocr"]) == (False, True)
    assert (d / "original.pdf").read_bytes() == original
    assert pymupdf.open(d / "working.pdf")[0].rect == pymupdf.open(d / "original.pdf")[0].rect

    sentences = client.get(f"/documents/{meta['id']}/sentences").json()
    assert "sample was small" in sentences[0]["text"]
    assert client.get(f"/documents/{meta['id']}/file").content == (d / "working.pdf").read_bytes()


def test_ocr_failure_is_503(client, doc_id, monkeypatch):
    def boom(src):
        raise RuntimeError("no tessdata")

    monkeypatch.setattr(documents, "ocr_pdf", boom)
    r = client.post(f"/documents/{doc_id}/ocr")
    assert r.status_code == 503
    assert "Tesseract" in r.json()["detail"]
