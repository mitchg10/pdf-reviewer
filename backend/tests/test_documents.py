from tests.conftest import make_pdf


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_upload_list_get_and_serve(client, doc_id):
    meta = client.get(f"/documents/{doc_id}").json()
    assert meta["pages"] == 2
    assert meta["stem"] == "My_Review"
    assert meta["scanned"] is False
    assert [d["id"] for d in client.get("/documents").json()] == [doc_id]
    r = client.get(f"/documents/{doc_id}/file")
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")


def test_list_empty_when_no_data_dir(client):
    assert client.get("/documents").json() == []


def test_rejects_non_pdf(client):
    r = client.post("/documents", files={"file": ("x.pdf", b"not a pdf", "application/pdf")})
    assert r.status_code == 422


def test_flags_scanned_pdf(client):
    r = client.post("/documents", files={"file": ("scan.pdf", make_pdf(["", ""]), "application/pdf")})
    assert r.json()["scanned"] is True


def test_rejects_bad_and_unknown_ids(client):
    assert client.get("/documents/..%2F..%2Fetc/file").status_code in (404, 422)
    assert client.get("/documents/bad!id!!/file").status_code == 422
    assert client.get("/documents/AAAAAAAA/file").status_code == 404
