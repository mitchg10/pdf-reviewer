import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import annotations, documents, export, models_store, sentences, tts
from .constants import FRONTEND_ORIGINS, LAN_ORIGIN_RE

app = FastAPI(title="PDF Read-Aloud Reviewer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_origin_regex=LAN_ORIGIN_RE if os.environ.get("PDF_ASSIST_NETWORK") == "1" else None,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)
for module in (documents, annotations, export, sentences, tts, models_store):
    app.include_router(module.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(tts.ProviderError)
def provider_failed(_: Request, e: tts.ProviderError) -> JSONResponse:
    return JSONResponse({"detail": str(e)}, status_code=502)
