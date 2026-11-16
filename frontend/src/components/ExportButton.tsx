"use client";
import { useState } from "react";
import { Button } from "./ui";
import { exportReview } from "@/lib/api";

export function ExportButton({ docId }: { docId: string }) {
  const [links, setLinks] = useState<{ pdf: string; csv: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setLinks(await exportReview(docId));
    } catch (e) {
      setError(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      {links && (
        <>
          <a href={links.pdf} className="text-xs underline">
            Annotated PDF
          </a>
          <a href={links.csv} className="text-xs underline">
            CSV
          </a>
        </>
      )}
      <Button variant="primary" onClick={run} disabled={busy}>
        {busy ? "Exporting…" : "Export"}
      </Button>
    </div>
  );
}
