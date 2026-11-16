import type { Severity } from "./types";

// Color always paired with the label so it is never the only signal.
export const SEVERITY_COLOR: Record<Severity, string> = {
  Consider: "var(--series-6)",
  "Should fix": "var(--series-4)",
  "Must fix": "var(--series-2)",
  Praise: "var(--series-3)",
};
