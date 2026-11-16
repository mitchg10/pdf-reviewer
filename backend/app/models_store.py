"""Speech models live in DATA_DIR/models.json; weights downloaded from Hugging Face go in DATA_DIR/models/."""

import secrets
import shutil
import threading
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from huggingface_hub import HfApi, snapshot_download
from pydantic import BaseModel, Field, model_validator

from . import constants
from .storage import read_json, write_json

router = APIRouter(tags=["models"])

ModelType = Literal["kokoro", "mlx", "openai", "elevenlabs", "ollama"]
LOCAL_TYPES = ("kokoro", "mlx")  # weights live in a folder, not behind a URL
DEFAULT_KOKORO_REPO = "fastrtc/kokoro-onnx"


class ModelIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    type: ModelType
    # kokoro/mlx: folder under DATA_DIR/models (or absolute path); others: base URL
    location: str = Field(min_length=1, max_length=500)
    model: str = Field(default="", max_length=200)
    voice: str = Field(min_length=1, max_length=200)
    # name of the environment variable holding the key, never the key itself
    api_key_env: str | None = Field(default=None, pattern=r"^[A-Z_][A-Z0-9_]*$")

    @model_validator(mode="after")
    def check_location(self):
        if self.type not in LOCAL_TYPES and not self.location.startswith(("http://", "https://")):
            raise ValueError("location must be an http(s) base URL for endpoint models")
        return self


class Model(ModelIn):
    id: str


DEFAULT_STORE = {
    "active": "kokoro",
    "models": [
        Model(
            id="kokoro", name="Kokoro (local)", type="kokoro", location="fastrtc--kokoro-onnx", voice="af_heart"
        ).model_dump(),
        Model(
            id="kokoro-mlx",
            name="Kokoro MLX 8-bit (Apple Silicon)",
            type="mlx",
            location="mlx-community--Kokoro-82M-8bit",
            voice="af_heart",
        ).model_dump(),
    ],
}


def models_dir() -> Path:
    return constants.DATA_DIR / "models"


def store_path() -> Path:
    return constants.DATA_DIR / "models.json"


def load() -> dict:
    return read_json(store_path(), DEFAULT_STORE)


def all_models() -> list[Model]:
    return [Model(**m) for m in load()["models"]]


def get(model_id: str) -> Model:
    found = next((m for m in all_models() if m.id == model_id), None)
    if not found:
        raise HTTPException(404, f"model '{model_id}' not found")
    return found


def active() -> Model:
    active_id = load()["active"]
    if not active_id:
        raise HTTPException(409, "No speech model is active. Pick one on the Models page.")
    return get(active_id)


def save(active_id: str | None, models: list[Model]) -> None:
    write_json(store_path(), {"active": active_id, "models": [m.model_dump() for m in models]})


def weights_folder(m: Model) -> Path:
    p = Path(m.location)
    return p if p.is_absolute() else models_dir() / p


@router.get("/models")
def list_models() -> list[Model]:
    return all_models()


@router.post("/models", status_code=201)
def add_model(body: ModelIn) -> Model:
    m = Model(id=secrets.token_urlsafe(6), **body.model_dump())
    save(load()["active"], [*all_models(), m])
    return m


@router.put("/models/{model_id}")
def edit_model(model_id: str, body: ModelIn) -> Model:
    get(model_id)
    m = Model(id=model_id, **body.model_dump())
    save(load()["active"], [m if x.id == model_id else x for x in all_models()])
    return m


@router.delete("/models/{model_id}", status_code=204)
def delete_model(model_id: str, delete_weights: bool = False) -> None:
    m = get(model_id)
    if delete_weights and m.type in LOCAL_TYPES:
        folder = weights_folder(m).resolve()
        # only ever delete inside our own models folder
        if not folder.is_relative_to(models_dir().resolve()) or folder == models_dir().resolve():
            raise HTTPException(422, "Weights outside the models folder are never deleted")
        shutil.rmtree(folder, ignore_errors=True)
    store = load()
    remaining = [x for x in all_models() if x.id != model_id]
    save(None if store["active"] == model_id else store["active"], remaining)


class Settings(BaseModel):
    active: str | None


@router.get("/settings")
def get_settings() -> dict:
    active_id = load()["active"]
    return {"active": active_id, "model": get(active_id) if active_id else None}


@router.put("/settings")
def put_settings(body: Settings) -> dict:
    if body.active:
        get(body.active)
    save(body.active, all_models())
    return get_settings()


# --- Hugging Face downloads -------------------------------------------------

# ponytail: in-memory job table, lost on restart (the files on disk are not)
JOBS: dict[str, dict] = {}


class DownloadIn(BaseModel):
    repo_id: str = Field(pattern=r"^[\w-][\w.-]*/[\w-][\w.-]*$")


def folder_for(repo_id: str) -> str:
    return repo_id.replace("/", "--")


def run_download(job: str, repo_id: str) -> None:
    try:
        info = HfApi().model_info(repo_id, files_metadata=True)
        JOBS[job] = {**JOBS[job], "total": sum(s.size or 0 for s in info.siblings or [])}
        snapshot_download(repo_id, local_dir=models_dir() / folder_for(repo_id))
        JOBS[job] = {**JOBS[job], "status": "done"}
    except Exception as e:  # noqa: BLE001 - any failure is reported to the UI, not raised in a thread
        JOBS[job] = {**JOBS[job], "status": "error", "error": f"{type(e).__name__}: {e}"}


def dir_size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file()) if path.exists() else 0


@router.post("/models/download", status_code=202)
def start_download(body: DownloadIn) -> dict:
    job = secrets.token_urlsafe(6)
    JOBS[job] = {"repo_id": body.repo_id, "folder": folder_for(body.repo_id), "status": "running", "total": 0}
    threading.Thread(target=run_download, args=(job, body.repo_id), daemon=True).start()
    return {"job": job, **JOBS[job]}


@router.get("/models/download/{job}")
def download_status(job: str) -> dict:
    if job not in JOBS:
        raise HTTPException(404, "unknown download job")
    j = JOBS[job]
    return {"job": job, **j, "downloaded": dir_size(models_dir() / j["folder"])}
