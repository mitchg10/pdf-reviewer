"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { toPdfRects } from "@/lib/coords";
import { SEVERITY_COLOR } from "@/lib/severity";
import type { Annotation, PageRect, Rect } from "@/lib/types";

// Must be set in the same module that renders <Document> (react-pdf README).
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export type Selection = { page: number; rects: Rect[]; text: string };
export type ReadAlong = PageRect[] | null;

type Props = {
  url: string;
  scale: number;
  annotations: Annotation[];
  readAlong?: ReadAlong;
  onSelect: (s: Selection) => void;
};

type OverlayProps = { r: Rect; scale: number; color: string; anchor?: React.Ref<HTMLDivElement>; id?: string };

function Overlay({ r, scale, color, anchor, id }: OverlayProps) {
  return (
    <div
      ref={anchor}
      id={id}
      className="overlay"
      style={{
        left: r.x0 * scale,
        top: r.y0 * scale,
        width: (r.x1 - r.x0) * scale,
        height: (r.y1 - r.y0) * scale,
        background: color,
      }}
    />
  );
}

export function readSelection(scale: number): Selection | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const start = range.startContainer;
  const pageEl = (start instanceof Element ? start : start.parentElement)?.closest<HTMLElement>("[data-page]");
  if (!pageEl) return null;
  // ponytail: a selection that crosses pages is clipped to its first page
  const rects = toPdfRects(Array.from(range.getClientRects()), pageEl.getBoundingClientRect(), scale);
  const text = sel.toString().replace(/\s+/g, " ").trim();
  return rects.length && text ? { page: Number(pageEl.dataset.page), rects, text } : null;
}

// ponytail: renders every page; virtualize if 100+ page documents get sluggish
export default function PdfViewer({ url, scale, annotations, readAlong, onSelect }: Props) {
  const [pages, setPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const readAlongAnchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // "nearest" only scrolls when the sentence is off screen, so reading does not jitter the page
    readAlongAnchor.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [readAlong]);
  const handleMouseUp = useCallback(() => {
    const s = readSelection(scale);
    if (s) onSelect(s);
  }, [scale, onSelect]);

  return (
    <div onMouseUp={handleMouseUp} className="flex flex-col items-center gap-4 p-4">
      {loadError && <p className="text-danger text-sm">Could not load the PDF: {loadError}</p>}
      <Document
        file={url}
        onLoadSuccess={(pdf) => setPages(pdf.numPages)}
        onLoadError={(e) => setLoadError(e.message)}
      >
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <div key={n} data-page={n} id={`page-${n}`} className="relative border border-line shadow-sm">
            <Page pageNumber={n} scale={scale} renderAnnotationLayer={false} />
            {annotations
              .filter((a) => a.page === n)
              .flatMap((a) =>
                a.rects.map((r, j) => (
                  <Overlay
                    key={`${a.id}-${j}`}
                    id={j === 0 ? `ann-${a.id}` : undefined}
                    r={r}
                    scale={scale}
                    color={SEVERITY_COLOR[a.severity]}
                  />
                )),
              )}
            {readAlong?.map((r, j) =>
              r.page === n ? (
                <Overlay
                  key={`ra-${j}`}
                  r={r}
                  scale={scale}
                  color="var(--series-1)"
                  anchor={j === 0 ? readAlongAnchor : undefined}
                />
              ) : null,
            )}
          </div>
        ))}
      </Document>
    </div>
  );
}
