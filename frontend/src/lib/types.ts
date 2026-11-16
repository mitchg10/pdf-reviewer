export const SEVERITIES = ["Consider", "Should fix", "Must fix", "Praise"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** PDF points, top-left origin (pdf.js viewport at scale 1 and PyMuPDF agree on this). */
export type Rect = { x0: number; y0: number; x1: number; y1: number };

export type Annotation = {
  id: string;
  number: number;
  page: number;
  rects: Rect[];
  text: string;
  comment: string;
  severity: Severity;
};

export type DocumentMeta = {
  id: string;
  name: string;
  stem: string;
  pages: number;
  scanned: boolean;
  uploaded: string;
  ocr: boolean;
};

export type PageRect = Rect & { page: number };
export type Sentence = { index: number; page: number; text: string; rects: PageRect[] };

export const MODEL_TYPES = ["kokoro", "mlx", "openai", "elevenlabs", "ollama"] as const;
export const LOCAL_TYPES: readonly ModelType[] = ["kokoro", "mlx"];
export type ModelType = (typeof MODEL_TYPES)[number];
export type ModelIn = {
  name: string;
  type: ModelType;
  location: string;
  model: string;
  voice: string;
  api_key_env: string | null;
};
export type SpeechModel = ModelIn & { id: string };
export type Settings = { active: string | null; model: SpeechModel | null };
export type DownloadJob = {
  job: string;
  repo_id: string;
  folder: string;
  status: "running" | "done" | "error";
  total: number;
  downloaded?: number;
  error?: string;
};
