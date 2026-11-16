import io
import wave
from types import SimpleNamespace

import httpx
import numpy as np
import pytest

from app import tts
from app.models_store import Model


def model(**over):
    base = {"id": "m", "name": "Test", "type": "openai", "location": "http://tts.local/v1", "voice": "alloy"}
    return Model(**{**base, **over})


@pytest.fixture
def calls(monkeypatch):
    seen = []

    def fake(m, text):
        seen.append(text)
        return tts.wav_bytes(b"\0\0" * 10, 16000)

    monkeypatch.setitem(tts.PROVIDERS, "kokoro", fake)
    return seen


def test_tts_endpoint_caches_audio(client, doc_id, calls):
    r1 = client.post(f"/documents/{doc_id}/tts", json={"index": 0})
    r2 = client.post(f"/documents/{doc_id}/tts", json={"index": 0})
    assert r1.status_code == 200
    assert r1.headers["content-type"] == "audio/wav"
    assert r1.content == r2.content
    assert calls == ["The sample was small."]


def test_tts_bad_index(client, doc_id, calls):
    assert client.post(f"/documents/{doc_id}/tts", json={"index": 99}).status_code == 404


def test_model_test_endpoint(client, calls):
    assert client.post("/models/kokoro/test").status_code == 200
    assert calls == [tts.SAMPLE_TEXT]


def test_cache_key_depends_on_voice():
    assert tts.cache_key(model(voice="a"), "x") != tts.cache_key(model(voice="b"), "x")


def mock_post(monkeypatch, handler):
    transport = httpx.MockTransport(handler)
    real = httpx.Client(transport=transport)
    monkeypatch.setattr(tts.httpx, "post", lambda url, **kw: real.post(url, **kw))


def test_openai_adapter_sends_bearer_key(monkeypatch):
    monkeypatch.setenv("UNI_TTS_KEY", "secret")
    seen = {}

    def handler(req):
        seen.update(url=str(req.url), auth=req.headers.get("authorization"), body=req.content)
        return httpx.Response(200, content=b"RIFFwav")

    mock_post(monkeypatch, handler)
    out = tts.openai_compatible(model(api_key_env="UNI_TTS_KEY"), "Hi.")
    assert out == b"RIFFwav"
    assert seen["url"] == "http://tts.local/v1/audio/speech"
    assert seen["auth"] == "Bearer secret"
    assert b'"response_format":"wav"' in seen["body"]


def test_ollama_adds_v1(monkeypatch):
    seen = {}
    mock_post(monkeypatch, lambda req: seen.update(url=str(req.url)) or httpx.Response(200, content=b"x"))
    tts.ollama(model(type="ollama", location="http://localhost:11434"), "Hi.")
    assert seen["url"] == "http://localhost:11434/v1/audio/speech"


def test_elevenlabs_wraps_pcm_in_wav(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    seen = {}

    def handler(req):
        seen.update(url=str(req.url), key=req.headers.get("xi-api-key"))
        return httpx.Response(200, content=b"\x01\x00" * 100)

    mock_post(monkeypatch, handler)
    m = model(type="elevenlabs", location="https://api.elevenlabs.io", voice="v1d", api_key_env="ELEVENLABS_API_KEY")
    out = tts.elevenlabs(m, "Hi.")
    assert seen["url"] == "https://api.elevenlabs.io/v1/text-to-speech/v1d?output_format=pcm_24000"
    assert seen["key"] == "k"
    with wave.open(io.BytesIO(out)) as w:
        assert (w.getframerate(), w.getnframes()) == (24000, 100)


def test_missing_key_env_is_a_provider_error(monkeypatch):
    monkeypatch.delenv("NOPE_KEY", raising=False)
    with pytest.raises(tts.ProviderError, match="NOPE_KEY"):
        tts.openai_compatible(model(api_key_env="NOPE_KEY"), "Hi.")
    with pytest.raises(tts.ProviderError, match="API key"):
        tts.elevenlabs(model(type="elevenlabs"), "Hi.")


def test_http_failure_maps_to_502_without_leaking_key(client, monkeypatch):
    monkeypatch.setenv("UNI_TTS_KEY", "supersecret")
    mock_post(monkeypatch, lambda req: httpx.Response(401, text="bad key"))
    r = client.post("/models", json={**model(api_key_env="UNI_TTS_KEY").model_dump(exclude={"id"})})
    resp = client.post(f"/models/{r.json()['id']}/test")
    assert resp.status_code == 502
    assert "401" in resp.json()["detail"]
    assert "supersecret" not in resp.text


def test_unreachable_endpoint(monkeypatch):
    def boom(req):
        raise httpx.ConnectError("refused")

    mock_post(monkeypatch, boom)
    with pytest.raises(tts.ProviderError, match="could not reach"):
        tts.openai_compatible(model(), "Hi.")


def test_kokoro_missing_files_message(data_dir):
    with pytest.raises(tts.ProviderError, match="fastrtc/kokoro-onnx"):
        tts.kokoro(model(type="kokoro", location="nothing-here"), "Hi.")


def test_mlx_missing_files_message(data_dir):
    with pytest.raises(tts.ProviderError, match="mlx-community/Kokoro-82M-8bit"):
        tts.mlx(model(type="mlx", location="nothing-here"), "Hi.")


def test_mlx_adapter_joins_chunks_and_picks_accent(monkeypatch):
    seen = {}

    class FakeMlx:
        sample_rate = 24000

        def generate(self, text, voice, lang_code):
            seen.update(voice=voice, lang=lang_code)
            for n in (100, 50):
                yield SimpleNamespace(audio=np.zeros(n, dtype=np.float32))

    monkeypatch.setattr(tts, "load_mlx", lambda folder: FakeMlx())
    out = tts.mlx(model(type="mlx", location="x", voice="bf_emma"), "Hi.")
    assert seen == {"voice": "bf_emma", "lang": "b"}
    with wave.open(io.BytesIO(out)) as w:
        assert (w.getframerate(), w.getnframes()) == (24000, 150)


def test_mlx_bad_voice_is_provider_error(monkeypatch):
    class FakeMlx:
        sample_rate = 24000

        def generate(self, text, voice, lang_code):
            raise FileNotFoundError("voices/zz_nope.pt")
            yield

    monkeypatch.setattr(tts, "load_mlx", lambda folder: FakeMlx())
    with pytest.raises(tts.ProviderError, match="zz_nope"):
        tts.mlx(model(type="mlx", location="x", voice="zz_nope"), "Hi.")
