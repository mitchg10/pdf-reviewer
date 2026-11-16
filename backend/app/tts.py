"""One synthesize function per provider type; each takes a Model and text and returns WAV bytes."""

import hashlib
import io
import os
import threading
import wave
from collections.abc import Callable
from functools import cache
from pathlib import Path

import httpx
import numpy as np
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from . import models_store
from .models_store import Model
from .sentences import get_sentences
from .storage import DocId, doc_dir, write_bytes_atomic

router = APIRouter(tags=["tts"])

SAMPLE_TEXT = "This is a sample sentence, read with the selected voice."
HTTP_TIMEOUT = 60.0
ELEVENLABS_RATE = 24_000


class ProviderError(Exception):
    """A provider failed; the message is shown to the user, so it must never contain a key."""


def wav_bytes(pcm16: bytes, rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm16)
    return buf.getvalue()


def api_key(m: Model) -> str | None:
    if not m.api_key_env:
        return None
    key = os.environ.get(m.api_key_env)
    if not key:
        raise ProviderError(f"Set the {m.api_key_env} environment variable and restart the API.")
    return key


@cache
def load_kokoro(folder: str):
    from kokoro_onnx import Kokoro  # heavy import, only when Kokoro is actually used

    onnx = sorted(Path(folder).glob("*.onnx"))
    voices = sorted(Path(folder).glob("voices*.bin"))
    if not onnx or not voices:
        raise ProviderError(
            f"Kokoro files not found in {folder}. Download '{models_store.DEFAULT_KOKORO_REPO}' on the Models page."
        )
    return Kokoro(str(onnx[0]), str(voices[0]))


def kokoro(m: Model, text: str) -> bytes:
    k = load_kokoro(str(models_store.weights_folder(m)))
    try:
        samples, rate = k.create(text, voice=m.voice, speed=1.0, lang="en-us")
    except (KeyError, ValueError) as e:
        raise ProviderError(f"Kokoro could not speak with voice '{m.voice}': {e}") from e
    return float_wav(samples, rate)


def float_wav(samples, rate: int) -> bytes:
    pcm = (np.clip(np.asarray(samples, dtype=np.float32).reshape(-1), -1, 1) * 32767).astype("<i2").tobytes()
    return wav_bytes(pcm, rate)


MLX_REPO = "mlx-community/Kokoro-82M-8bit"
# ponytail: one MLX generation at a time (prefetch sends two); per-model locks if several MLX models run at once
MLX_LOCK = threading.Lock()


@cache
def load_mlx(folder: str):
    try:
        from mlx_audio.tts.utils import load_model  # Apple Silicon only
    except ImportError as e:
        raise ProviderError("MLX models need an Apple Silicon Mac with mlx-audio installed.") from e
    if not (Path(folder) / "config.json").exists():
        raise ProviderError(f"MLX model files not found in {folder}. Download '{MLX_REPO}' on the Models page.")
    return load_model(Path(folder))


def mlx(m: Model, text: str) -> bytes:
    """Kokoro on Apple's MLX; the voice prefix picks the accent (af_/am_ American, bf_/bm_ British)."""
    model = load_mlx(str(models_store.weights_folder(m)))
    try:
        with MLX_LOCK:
            chunks = [np.array(r.audio).reshape(-1) for r in model.generate(text, voice=m.voice, lang_code=m.voice[0])]
    except (FileNotFoundError, KeyError, ValueError) as e:
        raise ProviderError(f"MLX Kokoro could not speak with voice '{m.voice}': {e}") from e
    return float_wav(np.concatenate(chunks) if chunks else np.zeros(0), model.sample_rate)


def post(m: Model, url: str, **kwargs) -> httpx.Response:
    try:
        r = httpx.post(url, timeout=HTTP_TIMEOUT, **kwargs)
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise ProviderError(f"{m.name}: {url} returned {e.response.status_code}: {e.response.text[:200]}") from e
    except httpx.HTTPError as e:
        raise ProviderError(f"{m.name}: could not reach {url} ({type(e).__name__})") from e
    return r


def openai_compatible(m: Model, text: str) -> bytes:
    key = api_key(m)
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    body = {"model": m.model, "input": text, "voice": m.voice, "response_format": "wav"}
    return post(m, f"{m.location.rstrip('/')}/audio/speech", json=body, headers=headers).content


def ollama(m: Model, text: str) -> bytes:
    """Ollama only speaks if the server exposes the OpenAI speech route under /v1."""
    base = m.location.rstrip("/")
    return openai_compatible(m.model_copy(update={"location": base if base.endswith("/v1") else f"{base}/v1"}), text)


def elevenlabs(m: Model, text: str) -> bytes:
    key = api_key(m)
    if not key:
        raise ProviderError("ElevenLabs needs an API key environment variable (e.g. ELEVENLABS_API_KEY).")
    r = post(
        m,
        f"{m.location.rstrip('/')}/v1/text-to-speech/{m.voice}",
        params={"output_format": f"pcm_{ELEVENLABS_RATE}"},
        headers={"xi-api-key": key},
        json={"text": text, "model_id": m.model or "eleven_multilingual_v2"},
    )
    return wav_bytes(r.content, ELEVENLABS_RATE)


PROVIDERS: dict[str, Callable[[Model, str], bytes]] = {
    "kokoro": kokoro,
    "mlx": mlx,
    "openai": openai_compatible,
    "ollama": ollama,
    "elevenlabs": elevenlabs,
}


def cache_key(m: Model, text: str) -> str:
    return hashlib.sha256(f"{m.type}|{m.location}|{m.model}|{m.voice}|{text}".encode()).hexdigest()


def synthesize(m: Model, text: str, cache_dir: Path | None = None) -> bytes:
    """Cached by provider, voice and text, so re-listening is free and cloud calls are not repeated."""
    cached = cache_dir / f"{cache_key(m, text)}.wav" if cache_dir else None
    if cached and cached.exists():
        return cached.read_bytes()
    audio = PROVIDERS[m.type](m, text)
    if cached:
        write_bytes_atomic(cached, audio)
    return audio


class TtsIn(BaseModel):
    index: int


@router.post("/documents/{doc_id}/tts")
def speak_sentence(doc_id: DocId, body: TtsIn) -> Response:
    sentences = get_sentences(doc_id)
    if not 0 <= body.index < len(sentences):
        raise HTTPException(404, f"no sentence {body.index} (document has {len(sentences)})")
    audio = synthesize(models_store.active(), sentences[body.index].text, doc_dir(doc_id) / "audio")
    return Response(audio, media_type="audio/wav")


@router.post("/models/{model_id}/test")
def test_model(model_id: str) -> Response:
    return Response(synthesize(models_store.get(model_id), SAMPLE_TEXT), media_type="audio/wav")
