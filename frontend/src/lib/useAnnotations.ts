"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { API, getAnnotations, putAnnotations } from "./api";
import type { Annotation } from "./types";

const SAVE_DELAY_MS = 400;

/** Annotations for one document; every change autosaves (debounced, flushed when the tab closes). */
export function useAnnotations(docId: string) {
  const [items, setItems] = useState<Annotation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef<Annotation[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    getAnnotations(docId).then(setItems, (e: Error) => setError(e.message));
  }, [docId]);

  const save = useCallback(async () => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setSaving(true);
    try {
      const saved = await putAnnotations(docId, next);
      const numbers = new Map(saved.map((a) => [a.id, a.number]));
      setItems((cur) => cur.map((a) => ({ ...a, number: numbers.get(a.id) ?? a.number })));
      setError(null);
    } catch (e) {
      pending.current = pending.current ?? next; // keep it so the next change or unload retries
      setError(`Comments not saved: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [docId]);

  const update = useCallback(
    (fn: (cur: Annotation[]) => Annotation[]) => {
      setItems((cur) => {
        const next = fn(cur);
        pending.current = next;
        return next;
      });
      clearTimeout(timer.current);
      timer.current = setTimeout(save, SAVE_DELAY_MS);
    },
    [save],
  );

  useEffect(() => {
    // keepalive lets the request outlive the tab (body limit 64 KB, plenty for comments)
    const flush = () => {
      if (!pending.current) return;
      fetch(`${API}/annotations/${docId}`, {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.current),
      });
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [docId]);

  return { items, update, error, saving };
}
