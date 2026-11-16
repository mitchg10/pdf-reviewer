import type { Annotation, DocumentMeta, DownloadJob, ModelIn, Sentence, Settings, SpeechModel } from "./types";

const DEFAULT_API = "http://127.0.0.1:8400";
// NEXT_PUBLIC_API_URL="" (make dev NETWORK=1) derives the host from the page URL for LAN use.
export const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window === "undefined" || process.env.NEXT_PUBLIC_API_URL === undefined
    ? DEFAULT_API
    : `${window.location.protocol}//${window.location.hostname}:8400`);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const isJson = typeof init?.body === "string";
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: isJson ? { "Content-Type": "application/json" } : undefined,
  });
  if (!r.ok) {
    const d = await r.json().catch(() => null);
    const detail = d?.detail;
    throw new Error(typeof detail === "string" ? detail : `${r.status} ${r.statusText}`);
  }
  return r.status === 204 ? (undefined as T) : r.json();
}

export const health = () => call<{ status: string }>("/health");
export const listDocuments = () => call<DocumentMeta[]>("/documents");
export const getDocument = (id: string) => call<DocumentMeta>(`/documents/${id}`);
export const runOcr = (id: string) => call<DocumentMeta>(`/documents/${id}/ocr`, { method: "POST" });
export const fileUrl = (id: string) => `${API}/documents/${id}/file`;

export function uploadDocument(file: File) {
  const body = new FormData();
  body.append("file", file);
  return call<DocumentMeta>("/documents", { method: "POST", body });
}

export const getAnnotations = (id: string) => call<Annotation[]>(`/annotations/${id}`);
export const putAnnotations = (id: string, items: Annotation[]) =>
  call<Annotation[]>(`/annotations/${id}`, { method: "PUT", body: JSON.stringify(items) });

export const exportReview = (id: string) =>
  call<{ pdf: string; csv: string }>(`/documents/${id}/export`, { method: "POST" }).then((l) => ({
    pdf: `${API}${l.pdf}`,
    csv: `${API}${l.csv}`,
  }));

export const getSentences = (id: string) => call<Sentence[]>(`/documents/${id}/sentences`);

/** POST that returns audio; errors carry the API's message (e.g. a provider failure). */
async function audio(path: string, body: object = {}): Promise<Blob> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => null);
    throw new Error(typeof d?.detail === "string" ? d.detail : `${r.status} ${r.statusText}`);
  }
  return r.blob();
}

export const speakSentence = (id: string, index: number) => audio(`/documents/${id}/tts`, { index });
export const testModel = (id: string) => audio(`/models/${id}/test`);

export const getSettings = () => call<Settings>("/settings");
export const setActiveModel = (active: string | null) =>
  call<Settings>("/settings", { method: "PUT", body: JSON.stringify({ active }) });
export const listModels = () => call<SpeechModel[]>("/models");
export const addModel = (m: ModelIn) => call<SpeechModel>("/models", { method: "POST", body: JSON.stringify(m) });
export const editModel = (id: string, m: ModelIn) =>
  call<SpeechModel>(`/models/${id}`, { method: "PUT", body: JSON.stringify(m) });
export const deleteModel = (id: string, deleteWeights: boolean) =>
  call<void>(`/models/${id}?delete_weights=${deleteWeights}`, { method: "DELETE" });
export const startDownload = (repo_id: string) =>
  call<DownloadJob>("/models/download", { method: "POST", body: JSON.stringify({ repo_id }) });
export const downloadStatus = (job: string) => call<DownloadJob>(`/models/download/${job}`);
