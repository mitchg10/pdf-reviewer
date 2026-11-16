import pymupdf
import pytest
from fastapi.testclient import TestClient

from app import constants
from app.main import app


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(constants, "DATA_DIR", tmp_path)
    return tmp_path


@pytest.fixture
def client():
    return TestClient(app)


def make_pdf(pages: list[str]) -> bytes:
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        if text:
            page.insert_text((72, 72), text, fontsize=12)
    return doc.tobytes()


@pytest.fixture
def doc_id(client):
    pdf = make_pdf(["The sample was small.", "Results were significant."])
    r = client.post("/documents", files={"file": ("My Review.pdf", pdf, "application/pdf")})
    assert r.status_code == 201
    return r.json()["id"]


def ann(id="a", page=1, y=60.0, x=72.0, severity="Should fix", text="The sample", comment="State N."):
    return {
        "id": id,
        "page": page,
        "rects": [{"x0": x, "y0": y, "x1": x + 80, "y1": y + 14}],
        "text": text,
        "comment": comment,
        "severity": severity,
    }
