import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function Sidebar() {
  return (
    <nav className="flex w-48 shrink-0 flex-col gap-1 border-r border-line bg-surface p-3 text-sm">
      <div className="mb-3 px-2 font-semibold">PDF Reviewer</div>
      <Link href="/" className="rounded-md px-2 py-1.5 hover:bg-background">
        Documents
      </Link>
      <Link href="/models" className="rounded-md px-2 py-1.5 hover:bg-background">
        Models
      </Link>
      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </nav>
  );
}
