"use client";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommentPanel } from "@/components/CommentPanel";
import { ExportButton } from "@/components/ExportButton";
import { Player } from "@/components/Player";
import { ScanBanner } from "@/components/ScanBanner";
import type { Selection } from "@/components/PdfViewer";
import { Button } from "@/components/ui";
import { fileUrl, getDocument } from "@/lib/api";
import { stepSpeed } from "@/lib/speed";
import { useAnnotations } from "@/lib/useAnnotations";
import { useReader } from "@/lib/useReader";
import { useShortcuts } from "@/lib/useShortcuts";
import { useStored } from "@/lib/useStored";
import type { Annotation, DocumentMeta } from "@/lib/types";

// pdf.js touches browser-only globals at import time
const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const DEFAULT_ZOOM = 1.25;
const SHORTCUTS = [
  ["space", "Play / pause"],
  ["[  ]", "Slower / faster"],
  ["c", "Comment on selection or current sentence (pauses audio)"],
  ["n  p", "Next / previous comment"],
  ["⌘↵", "Add comment"],
  ["esc", "Cancel comment"],
] as const;
const parseBool =(raw: string | null) => raw === "true";

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });

export function DocView() {
  const { id } = useParams<{ id: string }>();
  const [meta, setMeta] = useState<DocumentMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(DEFAULT_ZOOM);
  const [draft, setDraft] = useState<Selection | null>(null);
  const [readAlong, setReadAlong] = useStored("read-along", false, parseBool);
  const { items, update, error: saveError, saving } = useAnnotations(id);
  const reader = useReader(id);
  const cursor = useRef(-1); // comment last jumped to with n/p

  useEffect(() => {
    getDocument(id).then(setMeta, (e: Error) => setError(e.message));
  }, [id]);

  const add = useCallback(
    ({ comment, severity }: Pick<Annotation, "comment" | "severity">) => {
      if (!draft) return;
      const a: Annotation = { id: crypto.randomUUID(), number: 0, comment, severity, ...draft };
      update((cur) => [...cur, a]);
      setDraft(null);
      window.getSelection()?.removeAllRanges();
    },
    [draft, update],
  );
  const change = useCallback(
    (aid: string, patch: Partial<Annotation>) =>
      update((cur) => cur.map((a) => (a.id === aid ? { ...a, ...patch } : a))),
    [update],
  );
  const remove = useCallback((aid: string) => update((cur) => cur.filter((a) => a.id !== aid)), [update]);
  const zoom = (d: number) => setScale((s) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s + d)));

  const sorted = useMemo(() => [...items].sort((a, b) => a.number - b.number), [items]);
  const showComment = (i: number) => {
    const a = sorted[i];
    if (!a) return;
    cursor.current = i;
    scrollTo(`ann-${a.id}`);
    document.getElementById(`comment-${a.id}`)?.scrollIntoView({ block: "nearest" });
  };
  const goComment = (dir: 1 | -1) =>
    sorted.length && showComment((cursor.current + dir + sorted.length) % sorted.length);

  const lastComment = sorted.at(-1);
  const resumeAt = reader.sentences[reader.index];
  const resume = () => {
    if (!resumeAt) return;
    const page = document.getElementById(`page-${resumeAt.page}`);
    const scroller = page?.closest(".overflow-auto");
    if (!page || !scroller) return;
    // put the sentence's first line a little below the top of the view
    const pageTop = page.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top: pageTop + (resumeAt.rects[0]?.y0 ?? 0) * scale - 80, behavior: "smooth" });
  };

  useShortcuts({
    " ": reader.toggle,
    "[": () => reader.setSpeed((s) => stepSpeed(s, -1)),
    "]": () => reader.setSpeed((s) => stepSpeed(s, 1)),
    n: () => goComment(1),
    p: () => goComment(-1),
    c: async () => {
      const { readSelection } = await import("@/components/PdfViewer");
      const s = reader.sentences[reader.index];
      // no text selected: comment on the sentence being read
      // ponytail: a sentence that crosses pages is clipped to its first page, like text selections
      const target =
        readSelection(scale) ??
        (s && {
          page: s.page,
          text: s.text,
          rects: s.rects.filter((r) => r.page === s.page).map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 })),
        });
      if (!target) return;
      reader.pause();
      setDraft(target);
    },
  });

  if (error) return <p className="p-6 text-danger">{error}</p>;
  const current = readAlong ? (reader.sentences[reader.index]?.rects ?? null) : null;
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2 text-sm">
        <h1 className="truncate font-semibold">{meta?.name ?? "…"}</h1>
        <span className={`text-xs ${saveError ? "text-danger" : "text-muted"}`}>
          {saveError ?? (saving ? "Saving…" : "Saved")}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <select
            aria-label="Go to page"
            className="rounded border border-line bg-surface px-1 py-1 text-xs"
            value=""
            onChange={(e) => scrollTo(`page-${e.target.value}`)}
          >
            <option value="" disabled>
              Go to page
            </option>
            {Array.from({ length: meta?.pages ?? 0 }, (_, i) => (
              <option key={i} value={i + 1}>
                Page {i + 1}
              </option>
            ))}
          </select>
          <Button variant="ghost" aria-label="Zoom out" onClick={() => zoom(-ZOOM_STEP)}>
            −
          </Button>
          <span className="w-12 text-center font-mono text-xs">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" aria-label="Zoom in" onClick={() => zoom(ZOOM_STEP)}>
            +
          </Button>
          <Button
            variant="ghost"
            disabled={!resumeAt || reader.index === 0}
            onClick={resume}
            title="Scroll to where reading stopped (saved automatically)"
          >
            Resume p. {resumeAt?.page ?? "–"}
          </Button>
          <Button
            variant="ghost"
            disabled={!lastComment}
            onClick={() => showComment(sorted.length - 1)}
          >
            Last comment{lastComment ? ` (#${lastComment.number})` : ""}
          </Button>
          <ExportButton docId={id} />
        </div>
      </header>
      {meta?.scanned && <ScanBanner docId={id} />}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            <PdfViewer url={fileUrl(id)} scale={scale} annotations={items} readAlong={current} onSelect={setDraft} />
          </div>
          <Player reader={reader} readAlong={readAlong} setReadAlong={setReadAlong} pages={meta?.pages ?? 0} />
        </div>
        <div className="flex w-80 shrink-0 flex-col border-l border-line bg-surface">
          <CommentPanel
            items={items}
            draft={draft}
            onAdd={add}
            onCancel={() => setDraft(null)}
            onChange={change}
            onDelete={remove}
          />
          <details className="border-t border-line p-3 text-xs">
            <summary className="cursor-pointer text-muted">Keyboard shortcuts</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {SHORTCUTS.map(([keys, what]) => (
                <Fragment key={what}>
                  <dt className="font-mono">{keys}</dt>
                  <dd>{what}</dd>
                </Fragment>
              ))}
            </dl>
          </details>
        </div>
      </div>
    </div>
  );
}
