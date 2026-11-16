import { Suspense } from "react";
import { DocView } from "@/components/DocView";

export default function DocPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading…</p>}>
      <DocView />
    </Suspense>
  );
}
