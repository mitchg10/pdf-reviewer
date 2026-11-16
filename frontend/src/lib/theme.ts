"use client";

import { useSyncExternalStore } from "react";
import { DARK_QUERY, THEME_STORAGE_KEY, THEMES, type ResolvedTheme, type ThemePreference } from "./theme-script";

const listeners = new Set<() => void>();

function isPreference(value: unknown): value is ThemePreference {
  return THEMES.includes(value as ThemePreference);
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    return "system"; // storage blocked (privacy mode); fall back to the OS
  }
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function apply() {
  document.documentElement.dataset.theme = resolve(readPreference());
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  const media = matchMedia(DARK_QUERY);
  listeners.add(listener);
  media.addEventListener("change", apply);
  window.addEventListener("storage", apply); // another tab changed the preference
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", apply);
    window.removeEventListener("storage", apply);
  };
}

const resolvedSnapshot = () => resolve(readPreference());

export function setThemePreference(preference: ThemePreference) {
  if (!isPreference(preference)) throw new Error(`Unknown theme: ${String(preference)}`);
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // storage blocked: the choice still applies for this page view
  }
  document.documentElement.dataset.theme = resolve(preference);
  listeners.forEach((l) => l());
}

/** The saved preference plus the theme actually in effect; server renders assume system/light. */
export function useTheme() {
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  const resolved = useSyncExternalStore(subscribe, resolvedSnapshot, () => "light" as const);
  return { preference, resolved, setPreference: setThemePreference };
}
