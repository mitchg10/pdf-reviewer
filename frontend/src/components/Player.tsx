"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui";
import { getSettings } from "@/lib/api";
import { formatSpeed, SPEED_MAX, SPEED_MIN, stepSpeed } from "@/lib/speed";
import type { Reader } from "@/lib/useReader";
import type { Settings } from "@/lib/types";

const WHERE: Record<string, string> = { kokoro: "Local", mlx: "Local", openai: "Endpoint", ollama: "Endpoint", elevenlabs: "Cloud" };

function ProviderBadge() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    getSettings().then(setSettings, () => setSettings(null));
  }, []);
  const m = settings?.model;
  if (!m) return <span className="text-xs text-danger">No speech model selected</span>;
  const cloud = m.type === "elevenlabs";
  return (
    <span
      title={cloud ? "Text is sent to a cloud provider" : undefined}
      className={`rounded border px-1.5 py-0.5 text-xs ${cloud ? "border-danger text-danger" : "border-line text-muted"}`}
    >
      {WHERE[m.type]}: {m.name}
    </span>
  );
}

type Props = { reader: Reader; readAlong: boolean; setReadAlong: (v: boolean) => void; pages: number };

export function Player({ reader, readAlong, setReadAlong, pages }: Props) {
  const { sentences, index, playing, loading, error, speed, setSpeed, toggle, jump } = reader;
  const fromPage = (p: number) => {
    const i = sentences.findIndex((s) => s.page >= p);
    if (i !== -1) jump(i);
  };
  const empty = sentences.length === 0;
  return (
    <div
      role="region"
      aria-label="Audio player"
      className="flex flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-2 text-sm"
    >
      <Button variant="ghost" aria-label="Previous sentence" disabled={empty} onClick={() => jump(index - 1)}>
        ⏮
      </Button>
      <Button variant="primary" aria-label={playing ? "Pause" : "Play"} disabled={empty} onClick={toggle}>
        {playing ? (loading ? "…" : "Pause") : "Play"}
      </Button>
      <Button variant="ghost" aria-label="Next sentence" disabled={empty} onClick={() => jump(index + 1)}>
        ⏭
      </Button>
      <span className="font-mono text-xs text-muted">
        {empty ? "No text" : `${index + 1}/${sentences.length}`}
      </span>

      <div role="group" aria-label="Playback speed" className="ml-2 flex items-center gap-1">
        <Button
          variant="secondary"
          aria-label="Slower"
          title="Slower ( [ )"
          disabled={speed <= SPEED_MIN}
          onClick={() => setSpeed((s) => stepSpeed(s, -1))}
        >
          −
        </Button>
        <output aria-live="polite" className="w-14 text-center font-mono" data-testid="speed">
          {formatSpeed(speed)}
        </output>
        <Button
          variant="secondary"
          aria-label="Faster"
          title="Faster ( ] )"
          disabled={speed >= SPEED_MAX}
          onClick={() => setSpeed((s) => stepSpeed(s, 1))}
        >
          +
        </Button>
      </div>

      <label className="ml-2 flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={readAlong} onChange={(e) => setReadAlong(e.target.checked)} />
        Read-along highlight
      </label>
      <label className="flex items-center gap-1.5 text-xs">
        From page
        <select
          aria-label="Read from page"
          className="rounded border border-line bg-surface px-1 py-0.5"
          value=""
          onChange={(e) => fromPage(Number(e.target.value))}
          disabled={empty}
        >
          <option value="" disabled>
            {sentences[index]?.page ?? "–"}
          </option>
          {Array.from({ length: pages }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-2">
        {error && (
          <span role="alert" className="max-w-md truncate text-xs text-danger" title={error}>
            {error}
          </span>
        )}
        <ProviderBadge />
      </div>
    </div>
  );
}
