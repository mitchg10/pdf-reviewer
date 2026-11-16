import type { Rect } from "./types";

type Box = { left: number; top: number; right: number; bottom: number };

// ponytail: assumes unrotated pages; rotated scans need the viewport transform instead of a scale.
/** Client (screen) rects inside one page element → PDF-point rects, merged per line. */
export function toPdfRects(clientRects: Box[], page: Box, scale: number): Rect[] {
  const inside = clientRects.filter(
    (r) => r.right - r.left > 0.5 && r.bottom - r.top > 0.5 && r.top < page.bottom && r.bottom > page.top,
  );
  const pdf = inside.map((r) => ({
    x0: (r.left - page.left) / scale,
    y0: (r.top - page.top) / scale,
    x1: (r.right - page.left) / scale,
    y1: (r.bottom - page.top) / scale,
  }));
  return mergeLines(pdf);
}

const sameLine = (a: Rect, b: Rect) => {
  const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return overlap > 0.5 * Math.min(a.y1 - a.y0, b.y1 - b.y0);
};

/** Combine fragments (one per text span) that sit on the same line into one rect. */
export function mergeLines(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  return sorted.reduce<Rect[]>((lines, r) => {
    const i = lines.findIndex((l) => sameLine(l, r));
    if (i === -1) return [...lines, r];
    const l = lines[i];
    const merged = {
      x0: Math.min(l.x0, r.x0),
      y0: Math.min(l.y0, r.y0),
      x1: Math.max(l.x1, r.x1),
      y1: Math.max(l.y1, r.y1),
    };
    return lines.map((x, j) => (j === i ? merged : x));
  }, []);
}
