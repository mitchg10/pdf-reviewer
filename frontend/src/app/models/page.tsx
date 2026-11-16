"use client";
import { useCallback, useEffect, useState } from "react";
import { EMPTY_MODEL, ModelForm } from "@/components/ModelForm";
import { HfDownload } from "@/components/HfDownload";
import { Button, Card } from "@/components/ui";
import { addModel, deleteModel, editModel, getSettings, listModels, setActiveModel, testModel } from "@/lib/api";
import { LOCAL_TYPES, type ModelIn, type SpeechModel } from "@/lib/types";

type Editing = { id: string | null; initial: ModelIn } | null;

export default function ModelsPage() {
  const [models, setModels] = useState<SpeechModel[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ms, s] = await Promise.all([listModels(), getSettings()]);
      setModels(ms);
      setActive(s.active);
    } catch {
      setError("Can’t reach the API. Is `make dev` running?");
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = async (m: ModelIn) => {
    await (editing?.id ? editModel(editing.id, m) : addModel(m));
    setEditing(null);
    refresh();
  };
  const remove = async (m: SpeechModel) => {
    if (!confirm(`Delete “${m.name}”?`)) return;
    const weights = LOCAL_TYPES.includes(m.type) && confirm(`Also delete its downloaded files in data/models/${m.location}?`);
    await deleteModel(m.id, weights).catch((e: Error) => setError(e.message));
    refresh();
  };
  const activate = async (id: string) => setActive((await setActiveModel(id)).active);
  const test = async (m: SpeechModel) => {
    setStatus((s) => ({ ...s, [m.id]: "Testing…" }));
    try {
      const url = URL.createObjectURL(await testModel(m.id));
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      setStatus((s) => ({ ...s, [m.id]: "OK" }));
    } catch (e) {
      setStatus((s) => ({ ...s, [m.id]: (e as Error).message }));
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">Speech models</h1>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Card title="Configured">
        <ul className="flex flex-col divide-y divide-line">
          {models.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="active" checked={active === m.id} onChange={() => activate(m.id)} />
                <span className="font-medium">{m.name}</span>
              </label>
              <span className="text-xs text-muted">
                {m.type} · {m.voice} · {m.location}
                {m.api_key_env && ` · key from env ${m.api_key_env}`}
              </span>
              <div className="ml-auto flex items-center gap-1">
                {status[m.id] && (
                  <span
                    className={`max-w-xs truncate text-xs ${status[m.id] === "OK" ? "text-muted" : "text-danger"}`}
                    title={status[m.id]}
                  >
                    {status[m.id]}
                  </span>
                )}
                <Button variant="ghost" onClick={() => test(m)}>
                  Test
                </Button>
                <Button variant="ghost" onClick={() => setEditing({ id: m.id, initial: m })}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => remove(m)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          {editing ? (
            <ModelForm
              key={editing.id ?? "new"}
              initial={editing.initial}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <Button onClick={() => setEditing({ id: null, initial: EMPTY_MODEL })}>Add model</Button>
          )}
        </div>
      </Card>
      <Card title="Download from Hugging Face">
        <HfDownload />
      </Card>
    </div>
  );
}
