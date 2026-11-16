import { describe, expect, it } from "vitest";
import { mergeLines, toPdfRects } from "@/lib/coords";

const page = { left: 100, top: 50, right: 100 + 612 * 1.5, bottom: 50 + 792 * 1.5 };
const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h });

describe("toPdfRects", () => {
  it("converts screen pixels to PDF points at the given scale", () => {
    expect(toPdfRects([box(100 + 72 * 1.5, 50 + 60 * 1.5, 30, 15)], page, 1.5)).toEqual([
      { x0: 72, y0: 60, x1: 92, y1: 70 },
    ]);
  });

  it("drops zero-size rects and rects outside the page", () => {
    expect(toPdfRects([box(150, 80, 0, 10), box(150, 5000, 20, 10)], page, 1)).toEqual([]);
  });

  it("merges spans on one line and keeps separate lines apart", () => {
    const rects = toPdfRects([box(110, 60, 20, 10), box(135, 61, 20, 10), box(110, 80, 40, 10)], page, 1);
    expect(rects).toEqual([
      { x0: 10, y0: 10, x1: 55, y1: 21 },
      { x0: 10, y0: 30, x1: 50, y1: 40 },
    ]);
  });
});

describe("mergeLines", () => {
  it("does not mutate its input", () => {
    const input = [{ x0: 5, y0: 0, x1: 6, y1: 1 }, { x0: 0, y0: 0, x1: 1, y1: 1 }];
    const copy = structuredClone(input);
    mergeLines(input);
    expect(input).toEqual(copy);
  });
});
