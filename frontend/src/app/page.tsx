"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { listDocuments, uploadDocument } from "@/lib/api";
import type { DocumentMeta } from "@/lib/types";

export default function Home() {
  const [docs, setDocs] = useState<DocumentMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listDocuments().then(setDocs, () => setError("Can’t reach the API. Is `make dev` running?"));
  }, []);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const meta = await uploadDocument(file);
      setDocs((cur) => [meta, ...(cur ?? [])]);
    } catch (e) {
      setError(`Upload failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">Documents</h1>
      <label className="inline-flex w-fit cursor-pointer items-center rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90">
        {busy ? "Uploading…" : "Upload PDF"}
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={busy}
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Card title="Uploaded">
        {docs?.length === 0 && <p className="text-sm text-muted">No documents yet.</p>}
        <ul className="flex flex-col divide-y divide-line">
          {docs?.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <Link href={`/doc/${d.id}`} className="font-medium hover:underline">
                {d.name}
              </Link>
              <span className="text-xs text-muted">{d.pages} pages</span>
              {d.scanned && <span className="text-xs text-danger">scanned</span>}
              <span className="ml-auto text-xs text-muted">{new Date(d.uploaded).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
