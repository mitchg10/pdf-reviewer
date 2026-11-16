import csv
import hashlib
import io

import pymupdf

from app.constants import SEVERITY_RGB
from tests.conftest import ann


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def setup(client, doc_id):
    body = [
        ann("a", page=1, text="The sample was small.", comment="State N and how it was recruited."),
        ann("b", page=2, text="Results were significant.", comment="Report the test.", severity="Must fix"),
    ]
    client.put(f"/annotations/{doc_id}", json=body)


def test_export_csv_and_pdf(client, doc_id, data_dir):
    setup(client, doc_id)
    original = data_dir / "documents" / doc_id / "original.pdf"
    before = sha(original)

    links = client.post(f"/documents/{doc_id}/export").json()
    assert links == {"pdf": f"/documents/{doc_id}/export/pdf", "csv": f"/documents/{doc_id}/export/csv"}

    r = client.get(links["csv"])
    assert 'filename="My_Review.comments.csv"' in r.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(r.text)))
    assert rows == [
        ["number", "original_text", "comment", "severity", "page"],
        ["1", "The sample was small.", "State N and how it was recruited.", "Should fix", "1"],
        ["2", "Results were significant.", "Report the test.", "Must fix", "2"],
    ]

    pdf = pymupdf.open(stream=client.get(links["pdf"]).content, filetype="pdf")
    pages = list(pdf)  # keep pages alive; annots are unbound once their page is collected
    assert [len(list(p.annots())) for p in pages] == [1, 1]
    second = next(pages[1].annots())
    assert second.info["content"] == "#2 Must fix: Report the test."
    assert second.type[1] == "Highlight"
    assert tuple(round(c, 3) for c in second.colors["stroke"]) == SEVERITY_RGB["Must fix"]
    assert sha(original) == before


def test_export_without_page_column(client, doc_id):
    setup(client, doc_id)
    client.post(f"/documents/{doc_id}/export?include_page=false")
    header = client.get(f"/documents/{doc_id}/export/csv").text.splitlines()[0]
    assert header == "number,original_text,comment,severity"


def test_download_before_export_is_404(client, doc_id):
    assert client.get(f"/documents/{doc_id}/export/pdf").status_code == 404
    assert client.get(f"/documents/{doc_id}/export/exe").status_code == 422
