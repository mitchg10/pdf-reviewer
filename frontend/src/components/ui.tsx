import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// Small, dependency-free primitives; same look as laya-wrapper's ui.tsx.
const VARIANTS = {
  primary: "bg-foreground text-background hover:opacity-90",
  secondary: "border border-line bg-surface hover:bg-background",
  ghost: "hover:bg-background",
  danger: "border border-line text-danger hover:bg-background",
};

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export const INPUT =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm focus:outline-2 focus:outline-[var(--series-1)]";

export function Card({ title, children, label, testId }: { title: ReactNode; children: ReactNode; label?: string; testId?: string }) {
  return (
    <section aria-label={label} data-testid={testId} className="rounded-lg border border-line bg-surface">
      <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">{title}</h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded border border-line bg-chip px-1.5 py-0.5 text-xs font-medium">{children}</span>;
}
