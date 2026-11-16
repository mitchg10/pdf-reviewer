import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// Isolated data dir so e2e never touches real data/
export const DATA_DIR = path.join(os.tmpdir(), "pdf-assist-e2e-data");

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: "http://localhost:3400" },
  webServer: [
    {
      command: `rm -rf ${DATA_DIR} && PDF_ASSIST_DATA_DIR=${DATA_DIR} uv run uvicorn app.main:app --host 127.0.0.1 --port 8400`,
      cwd: "../backend",
      url: "http://127.0.0.1:8400/health",
      reuseExistingServer: false,
    },
    { command: "npm run dev", url: "http://localhost:3400", reuseExistingServer: false },
  ],
});
