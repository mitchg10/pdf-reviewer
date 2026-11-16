"use client";
import { useCallback, useSyncExternalStore } from "react";

type Primitive = string | number | boolean;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener); // another tab changed it
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (privacy mode)
  }
}

/** A primitive mirrored to localStorage; server render uses the fallback. */
export function useStored<T extends Primitive>(key: string, fallback: T, parse: (raw: string | null) => T) {
  const value = useSyncExternalStore(
    subscribe,
    () => parse(read(key)),
    () => fallback,
  );
  const set = useCallback(
    (next: T | ((cur: T) => T)) => {
      const v = typeof next === "function" ? next(parse(read(key))) : next;
      try {
        localStorage.setItem(key, String(v));
      } catch {
        // storage blocked: nothing to persist to
      }
      listeners.forEach((l) => l());
    },
    [key, parse],
  );
  return [value, set] as const;
}
