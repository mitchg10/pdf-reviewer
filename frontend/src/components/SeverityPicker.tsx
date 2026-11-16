import clsx from "clsx";
import { SEVERITY_COLOR } from "@/lib/severity";
import { SEVERITIES, type Severity } from "@/lib/types";

export function SeverityDot({ severity }: { severity: Severity }) {
  return <span className="inline-block size-2.5 rounded-full" style={{ background: SEVERITY_COLOR[severity] }} />;
}

export function SeverityPicker({ value, onChange }: { value: Severity; onChange: (s: Severity) => void }) {
  return (
    <div role="radiogroup" aria-label="Severity" className="flex flex-wrap gap-1">
      {SEVERITIES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={clsx(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
            value === s ? "border-foreground font-semibold" : "border-line text-muted hover:text-foreground",
          )}
        >
          <SeverityDot severity={s} />
          {s}
        </button>
      ))}
    </div>
  );
}
