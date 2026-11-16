"use client";
import { useState } from "react";
import { Button } from "./ui";
import { runOcr } from "@/lib/api";

export function ScanBanner({ docId }: { docId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ocr = async () => {
    setBusy(true);
    setError(null);
    try {
      await runOcr(docId);
      window.location.reload(); // simplest way to reload the PDF, sentences and audio for the new text layer
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-line bg-chip px-4 py-2 text-sm">
      <span>This PDF has no text layer (likely a scan), so it can’t be read aloud or highlighted.</span>
      <Button onClick={ocr} disabled={busy}>
        {busy ? "Running OCR…" : "OCR this PDF"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
      <span className="ml-auto text-xs text-muted">The original file is never changed.</span>
    </div>
  );
}
