import { describe, expect, it } from "vitest";
import { clampSpeed, formatSpeed, parseSpeed, SPEED_DEFAULT, stepSpeed } from "@/lib/speed";

describe("speed", () => {
  it("steps by exactly 0.05 through the 1.35–1.80 listening range", () => {
    const seen = [1.35];
    while (seen.at(-1)! < 1.8) seen.push(stepSpeed(seen.at(-1)!, 1));
    expect(seen).toEqual([1.35, 1.4, 1.45, 1.5, 1.55, 1.6, 1.65, 1.7, 1.75, 1.8]);
  });

  it("steps down and clamps at both ends", () => {
    expect(stepSpeed(1.4, -1)).toBe(1.35);
    expect(stepSpeed(3, 1)).toBe(3);
    expect(stepSpeed(0.5, -1)).toBe(0.5);
  });

  it("snaps off-grid values", () => {
    expect(clampSpeed(1.37)).toBe(1.35);
    expect(clampSpeed(1.38)).toBe(1.4);
    expect(clampSpeed(NaN)).toBe(SPEED_DEFAULT);
  });

  it("parses stored values safely", () => {
    expect(parseSpeed(null)).toBe(1.5);
    expect(parseSpeed("1.65")).toBe(1.65);
    expect(parseSpeed("garbage")).toBe(SPEED_DEFAULT);
    expect(parseSpeed("9")).toBe(3);
  });

  it("formats with two decimals", () => {
    expect(formatSpeed(1.4)).toBe("1.40×");
  });
});
