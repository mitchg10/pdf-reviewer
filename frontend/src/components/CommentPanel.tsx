"use client";
import { useState } from "react";
import { Button, INPUT } from "./ui";
import { SeverityDot, SeverityPicker } from "./SeverityPicker";
import type { Selection } from "./PdfViewer";
import type { Annotation, Severity } from "@/lib/types";

type Props = {
  items: Annotation[];
  draft: Selection | null;
  onAdd: (a: Pick<Annotation, "comment" | "severity">) => void;
  onCancel: () => void;
  onChange: (id: string, patch: Partial<Annotation>) => void;
  onDelete: (id: string) => void;
};

const quote = (t: string) => (t.length > 140 ? `${t.slice(0, 140)}…` : t);

function DraftForm({ draft, onAdd, onCancel }: Pick<Props, "onAdd" | "onCancel"> & { draft: Selection }) {
  const [comment, setComment] = useState("");
  const [severity, setSeverity] = useState<Severity>("Consider");
  const add = () => onAdd({ comment: comment.trim(), severity });
  return (
    <div data-testid="draft" className="flex flex-col gap-2 border-b border-line p-3">
      <blockquote className="border-l-2 border-line pl-2 text-xs text-muted">“{quote(draft.text)}”</blockquote>
      <SeverityPicker value={severity} onChange={setSeverity} />
      <textarea
        autoFocus
        aria-label="Comment"
        className={INPUT}
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Comment (⌘↵ to add, Esc to cancel)"
      />
      <div className="flex gap-2">
        <Button variant="primary" onClick={add}>
          Add comment
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Item({ a, onChange, onDelete }: { a: Annotation } & Pick<Props, "onChange" | "onDelete">) {
  return (
    <li id={`comment-${a.id}`} className="flex flex-col gap-2 border-b border-line p-3">
      <div className="flex items-center gap-2 text-xs">
        <a href={`#page-${a.page}`} className="font-mono font-semibold hover:underline">
          #{a.number}
        </a>
        <SeverityDot severity={a.severity} />
        <span>{a.severity}</span>
        <span className="text-muted">p. {a.page}</span>
        <button
          type="button"
          onClick={() => onDelete(a.id)}
          aria-label={`Delete comment ${a.number}`}
          className="ml-auto cursor-pointer text-muted hover:text-danger"
        >
          Delete
        </button>
      </div>
      <blockquote className="border-l-2 border-line pl-2 text-xs text-muted">“{quote(a.text)}”</blockquote>
      <SeverityPicker value={a.severity} onChange={(severity) => onChange(a.id, { severity })} />
      <textarea
        aria-label={`Comment ${a.number}`}
        className={INPUT}
        rows={2}
        value={a.comment}
        onChange={(e) => onChange(a.id, { comment: e.target.value })}
      />
    </li>
  );
}

export function CommentPanel({ items, draft, onAdd, onCancel, onChange, onDelete }: Props) {
  const sorted = [...items].sort((a, b) => a.number - b.number);
  return (
    <aside aria-label="Comments" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {draft && <DraftForm key={draft.text + draft.page} draft={draft} onAdd={onAdd} onCancel={onCancel} />}
      {sorted.length === 0 && !draft && (
        <p className="p-3 text-sm text-muted">Select text in the PDF to add a comment.</p>
      )}
      <ul>
        {sorted.map((a) => (
          <Item key={a.id} a={a} onChange={onChange} onDelete={onDelete} />
        ))}
      </ul>
    </aside>
  );
}
