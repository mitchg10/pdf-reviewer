export const SPEED_MIN = 0.5;
export const SPEED_MAX = 3;
export const SPEED_STEP = 0.05;
export const SPEED_DEFAULT = 1.5;

/** Snap to the 0.05 grid and clamp, so 1.35 + 0.05 is exactly 1.4, never 1.4000000000000001. */
export function clampSpeed(s: number): number {
  if (!Number.isFinite(s)) return SPEED_DEFAULT;
  const snapped = Math.round(s / SPEED_STEP) * SPEED_STEP;
  return Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, snapped)) * 100) / 100;
}

export const stepSpeed = (s: number, dir: 1 | -1) => clampSpeed(clampSpeed(s) + dir * SPEED_STEP);

export const parseSpeed = (raw: string | null) => (raw === null ? SPEED_DEFAULT : clampSpeed(Number(raw)));

export const formatSpeed = (s: number) => `${s.toFixed(2)}×`;
