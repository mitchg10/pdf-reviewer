# PDF Read-Aloud Reviewer

Reads a PDF aloud and lets you comment on it. Export writes `{name}.annotated.pdf` and `{name}.comments.csv`; the original is never modified. See `plan.md` for the design.

## Run

```sh
make install   # uv sync + npm install
make dev       # API on :8400, UI on http://localhost:3400
make test      # pytest + ruff, vitest, Playwright
```

First time: open **Models**, click **Download** (prefilled with `fastrtc/kokoro-onnx`, ~350 MB) and wait for it to finish. The default "Kokoro (local)" model then works.

## Keys (document view)

| Key | Action |
| --- | --- |
| `space` | Play / pause |
| `[` / `]` | Speed down / up by 0.05× (0.5×–3.0×, remembered) |
| `c` | Comment on the selected text (selecting also opens the form) |
| `n` / `p` | Next / previous comment |
| `⌘↵` / `Esc` | Save / cancel a comment |

## Data

Everything lives in `data/` (gitignored):

- `data/documents/{id}/`: `original.pdf`, `meta.json`, `annotations.json` (source of truth), `sentences.json`, `audio/` cache, exports, and `working.pdf` after OCR
- `data/models.json`: speech models; API keys are referenced by environment variable name only
- `data/models/`: downloaded weights

Set `PDF_ASSIST_DATA_DIR` to put data elsewhere.

## Speech providers

| Type | Location | Notes |
| --- | --- | --- |
| Local (Kokoro ONNX) | folder under `data/models` | Offline, any platform; voices such as `af_heart`, `af_sarah`, `bf_emma` |
| Local (Kokoro MLX) | folder under `data/models` | Apple Silicon only; download `mlx-community/Kokoro-82M-8bit`. Faster after the first sentence |
| OpenAI-compatible | base URL ending in `/v1` | University or self-hosted endpoints |
| ElevenLabs | `https://api.elevenlabs.io` | Cloud; the player badge turns red as a reminder |
| Ollama | server URL | Works only if the server exposes `/v1/audio/speech` |

Scanned PDFs: the banner's **OCR this PDF** uses the Homebrew Tesseract install.
