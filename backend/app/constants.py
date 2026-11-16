import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("PDF_ASSIST_DATA_DIR", REPO_ROOT / "data"))

# 3000-3300 and 8000-8300 are used by other projects; this app uses 3400/8400
FRONTEND_PORT, BACKEND_PORT = 3400, 8400
FRONTEND_ORIGINS = [f"http://localhost:{FRONTEND_PORT}", f"http://127.0.0.1:{FRONTEND_PORT}"]
LAN_ORIGIN_RE = (
    rf"^http://(192\.168\.\d{{1,3}}\.\d{{1,3}}|10\.\d{{1,3}}\.\d{{1,3}}\.\d{{1,3}}"
    rf"|172\.(1[6-9]|2\d|3[01])\.\d{{1,3}}\.\d{{1,3}}):{FRONTEND_PORT}$"
)

DOC_ID_RE = r"^[A-Za-z0-9_-]{8}$"  # secrets.token_urlsafe(6)
MAX_UPLOAD_BYTES = 200 * 1024 * 1024

SEVERITIES = ("Consider", "Should fix", "Must fix", "Praise")
# RGB 0-1, same hues as --series-6/4/2/3 in globals.css (Okabe-Ito)
SEVERITY_RGB = {
    "Consider": (0.337, 0.706, 0.914),
    "Should fix": (0.902, 0.624, 0.0),
    "Must fix": (0.835, 0.369, 0.0),
    "Praise": (0.0, 0.62, 0.451),
}
