import time
from types import SimpleNamespace

import pytest

from app import models_store

ENDPOINT = {
    "name": "University",
    "type": "openai",
    "location": "https://tts.example.edu/v1",
    "model": "tts-1",
    "voice": "alloy",
    "api_key_env": "UNI_TTS_KEY",
}


def test_default_store_has_active_kokoro(client):
    assert [m["id"] for m in client.get("/models").json()] == ["kokoro", "kokoro-mlx"]
    s = client.get("/settings").json()
    assert s["active"] == "kokoro"
    assert s["model"]["type"] == "kokoro"


def test_crud_and_activate(client):
    m = client.post("/models", json=ENDPOINT).json()
    assert len(client.get("/models").json()) == 3
    edited = client.put(f"/models/{m['id']}", json={**ENDPOINT, "voice": "nova"}).json()
    assert edited["voice"] == "nova"
    assert client.put("/settings", json={"active": m["id"]}).json()["model"]["name"] == "University"
    assert client.delete(f"/models/{m['id']}").status_code == 204
    assert client.get("/settings").json() == {"active": None, "model": None}


def test_key_value_never_stored_or_returned(client, monkeypatch, data_dir):
    monkeypatch.setenv("UNI_TTS_KEY", "supersecret")
    client.post("/models", json=ENDPOINT)
    assert "supersecret" not in client.get("/models").text
    assert "supersecret" not in (data_dir / "models.json").read_text()


@pytest.mark.parametrize(
    "bad",
    [
        {"api_key_env": "sk-abc123"},  # a pasted key instead of an env var name
        {"location": "tts.example.edu"},  # endpoint without scheme
        {"type": "piper"},
        {"name": ""},
    ],
)
def test_rejects_invalid_models(client, bad):
    assert client.post("/models", json={**ENDPOINT, **bad}).status_code == 422


def test_unknown_ids(client):
    assert client.put("/models/nope", json=ENDPOINT).status_code == 404
    assert client.delete("/models/nope").status_code == 404
    assert client.put("/settings", json={"active": "nope"}).status_code == 404


def test_no_active_model_is_409(client, doc_id):
    client.put("/settings", json={"active": None})
    assert client.post(f"/documents/{doc_id}/tts", json={"index": 0}).status_code == 409


def test_delete_weights_only_inside_models_dir(client, data_dir):
    weights = data_dir / "models" / "fastrtc--kokoro-onnx"
    weights.mkdir(parents=True)
    (weights / "kokoro.onnx").write_bytes(b"x")
    assert client.delete("/models/kokoro?delete_weights=true").status_code == 204
    assert not weights.exists()

    outside = client.post("/models", json={**ENDPOINT, "type": "kokoro", "location": str(data_dir)}).json()
    assert client.delete(f"/models/{outside['id']}?delete_weights=true").status_code == 422
    assert data_dir.exists()


FakeInfo = SimpleNamespace(siblings=[SimpleNamespace(size=4), SimpleNamespace(size=6)])


def test_hugging_face_download(client, monkeypatch, data_dir):
    def fake_snapshot(repo_id, local_dir):
        local_dir.mkdir(parents=True)
        (local_dir / "voices.bin").write_bytes(b"0123456789")

    monkeypatch.setattr(models_store, "snapshot_download", fake_snapshot)
    monkeypatch.setattr(models_store.HfApi, "model_info", lambda self, repo, files_metadata: FakeInfo)
    job = client.post("/models/download", json={"repo_id": "fastrtc/kokoro-onnx"}).json()
    assert job["folder"] == "fastrtc--kokoro-onnx"
    for _ in range(50):
        status = client.get(f"/models/download/{job['job']}").json()
        if status["status"] != "running":
            break
        time.sleep(0.02)
    assert status["status"] == "done"
    assert (status["downloaded"], status["total"]) == (10, 10)


def test_download_error_is_reported(client, monkeypatch):
    def fail(self, repo, files_metadata):
        raise RuntimeError("repo not found")

    monkeypatch.setattr(models_store.HfApi, "model_info", fail)
    job = client.post("/models/download", json={"repo_id": "a/b"}).json()
    for _ in range(50):
        status = client.get(f"/models/download/{job['job']}").json()
        if status["status"] != "running":
            break
        time.sleep(0.02)
    assert status["status"] == "error"
    assert "repo not found" in status["error"]


def test_download_validation(client):
    assert client.post("/models/download", json={"repo_id": "../etc"}).status_code == 422
    assert client.get("/models/download/nope").status_code == 404
