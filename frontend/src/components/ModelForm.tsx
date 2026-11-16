"use client";
import { useState } from "react";
import { Button, INPUT } from "./ui";
import { LOCAL_TYPES, MODEL_TYPES, type ModelIn, type ModelType } from "@/lib/types";

const TYPE_LABEL: Record<ModelType, string> = {
  kokoro: "Local (Kokoro ONNX)",
  mlx: "Local (Kokoro MLX, Apple Silicon)",
  openai: "OpenAI-compatible endpoint",
  elevenlabs: "ElevenLabs (cloud)",
  ollama: "Ollama",
};
const PRESETS: Record<ModelType, Partial<ModelIn>> = {
  kokoro: { location: "fastrtc--kokoro-onnx", voice: "af_heart", model: "", api_key_env: null },
  mlx: { location: "mlx-community--Kokoro-82M-8bit", voice: "af_heart", model: "", api_key_env: null },
  openai: { location: "https://", voice: "alloy", model: "tts-1" },
  elevenlabs: { location: "https://api.elevenlabs.io", model: "eleven_multilingual_v2", api_key_env: "ELEVENLABS_API_KEY" },
  ollama: { location: "http://localhost:11434", model: "", api_key_env: null },
};
const LOCATION_HINT: Record<ModelType, string> = {
  kokoro: "Folder under data/models (or an absolute path) holding a .onnx file and voices*.bin",
  mlx: "Folder under data/models holding an MLX Kokoro repo (config.json, voices/)",
  openai: "Base URL ending in /v1; the app calls {url}/audio/speech",
  elevenlabs: "Base URL",
  ollama: "Server URL; it must expose the OpenAI speech route under /v1",
};

export const EMPTY_MODEL: ModelIn = { name: "", type: "kokoro", ...PRESETS.kokoro } as ModelIn;

type Props = { initial: ModelIn; onSave: (m: ModelIn) => Promise<void>; onCancel: () => void };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-muted">{hint}</span>}
    </label>
  );
}

export function ModelForm({ initial, onSave, onCancel }: Props) {
  const [m, setM] = useState<ModelIn>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ModelIn>) => setM((cur) => ({ ...cur, ...patch }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSave({ ...m, api_key_env: m.api_key_env?.trim() || null });
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <Field label="Name">
        <input required className={INPUT} value={m.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Type">
        <select
          className={INPUT}
          value={m.type}
          onChange={(e) => {
            const type = e.target.value as ModelType;
            set({ type, ...PRESETS[type] });
          }}
        >
          {MODEL_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Location" hint={LOCATION_HINT[m.type]}>
        <input required className={INPUT} value={m.location} onChange={(e) => set({ location: e.target.value })} />
      </Field>
      <Field label="Voice" hint={LOCAL_TYPES.includes(m.type) ? "e.g. af_heart, af_sarah, am_michael, bf_emma" : undefined}>
        <input required className={INPUT} value={m.voice} onChange={(e) => set({ voice: e.target.value })} />
      </Field>
      {!LOCAL_TYPES.includes(m.type) && (
        <>
          <Field label="Model name">
            <input className={INPUT} value={m.model} onChange={(e) => set({ model: e.target.value })} />
          </Field>
          <Field label="API key environment variable" hint="The variable's name, never the key itself">
            <input
              className={INPUT}
              placeholder="e.g. UNI_TTS_KEY"
              pattern="[A-Z_][A-Z0-9_]*"
              value={m.api_key_env ?? ""}
              onChange={(e) => set({ api_key_env: e.target.value })}
            />
          </Field>
        </>
      )}
      {error && <p className="col-span-2 text-xs text-danger">{error}</p>}
      <div className="col-span-2 flex gap-2">
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
