from tests.conftest import ann


def test_empty_by_default(client, doc_id):
    assert client.get(f"/annotations/{doc_id}").json() == []


def test_round_trip_and_renumber_in_reading_order(client, doc_id):
    body = [ann("c", page=2), ann("b", y=300), ann("a", y=60)]
    saved = client.put(f"/annotations/{doc_id}", json=body).json()
    assert [(a["id"], a["number"]) for a in saved] == [("a", 1), ("b", 2), ("c", 3)]
    assert client.get(f"/annotations/{doc_id}").json() == saved


def test_renumbers_after_delete(client, doc_id):
    client.put(f"/annotations/{doc_id}", json=[ann("a"), ann("b", y=200), ann("c", y=400)])
    saved = client.put(f"/annotations/{doc_id}", json=[ann("a"), ann("c", y=400)]).json()
    assert [(a["id"], a["number"]) for a in saved] == [("a", 1), ("c", 2)]


def test_rejects_invalid_severity(client, doc_id):
    assert client.put(f"/annotations/{doc_id}", json=[ann(severity="Nit")]).status_code == 422


def test_rejects_page_past_end_and_duplicate_ids(client, doc_id):
    assert client.put(f"/annotations/{doc_id}", json=[ann(page=9)]).status_code == 422
    assert client.put(f"/annotations/{doc_id}", json=[ann("a"), ann("a")]).status_code == 422


def test_rejects_empty_rects(client, doc_id):
    assert client.put(f"/annotations/{doc_id}", json=[{**ann(), "rects": []}]).status_code == 422
