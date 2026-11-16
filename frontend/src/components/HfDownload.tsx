"use client";
import { useEffect, useState } from "react";
import { Button, INPUT } from "./ui";
import { downloadStatus, startDownload } from "@/lib/api";
import type { DownloadJob } from "@/lib/types";

const POLL_MS = 1000;
const mb = (b = 0) => `${(b / 1e6).toFixed(0)} MB`;

export function HfDownload() {
  const [repo, setRepo] = useState("fastrtc/kokoro-onnx");
  const [job, setJob] = useState<DownloadJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (job?.status !== "running") return;
    const t = setInterval(() => downloadStatus(job.job).then(setJob, (e: Error) => setError(e.message)), POLL_MS);
    return () => clearInterval(t);
  }, [job]);

  const start = async () => {
    setError(null);
    try {
      setJob(await startDownload(repo.trim()));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const pct = job?.total ? Math.min(100, Math.round((100 * (job.downloaded ?? 0)) / job.total)) : 0;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex gap-2">
        <input
          aria-label="Hugging Face repo ID"
          className={INPUT}
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="owner/repo"
        />
        <Button onClick={start} disabled={job?.status === "running"}>
          Download
        </Button>
      </div>
      <p className="text-xs text-muted">
        Saved to <code>data/models/{repo.replace("/", "--")}</code>. Local models run Kokoro ONNX repos (e.g. fastrtc/kokoro-onnx) or MLX Kokoro repos (e.g.
        mlx-community/Kokoro-82M-8bit), not arbitrary models.
      </p>
      {job && (
        <div className="flex flex-col gap-1 text-xs">
          <progress max={100} value={pct} className="w-full" />
          <span>
            {job.status === "running" && `${mb(job.downloaded)} of ${job.total ? mb(job.total) : "…"}`}
            {job.status === "done" && `Done: ${job.folder}. Use it as the Location of a Local model.`}
            {job.status === "error" && <span className="text-danger">{job.error}</span>}
          </span>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
