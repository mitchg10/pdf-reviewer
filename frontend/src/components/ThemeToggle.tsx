"use client";

import clsx from "clsx";
import { THEMES } from "@/lib/theme-script";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <div role="group" aria-label="Theme" data-testid="theme-toggle" className="ml-auto flex rounded-md border border-line p-0.5 text-xs">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={preference === t}
          onClick={() => setPreference(t)}
          className={clsx(
            "cursor-pointer rounded px-2 py-1 capitalize",
            preference === t ? "bg-background font-semibold text-foreground" : "text-muted hover:text-foreground",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
