import Link from "next/link";
import { BarChart3, KanbanSquare, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Board", icon: KanbanSquare },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/login", label: "Auth", icon: ShieldCheck }
];

export function AppShell({
  children,
  currentPath
}: {
  children: React.ReactNode;
  currentPath: string;
}) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 px-4 py-4 md:px-6 lg:px-8">
        <aside className="hidden w-64 shrink-0 flex-col rounded-[28px] border border-line/70 bg-white/80 p-5 shadow-panel backdrop-blur md:flex">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Tax Ops</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">Compliance Control</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Designed for fast recurring tax work, revision visibility, and clean accountability.
            </p>
          </div>

          <nav className="space-y-2">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                    currentPath === link.href
                      ? "bg-ink text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-3xl bg-accentSoft p-4">
            <p className="text-sm font-semibold text-accent">MVP focus</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Keep every update inside one card. Staff should never fight the system just to report progress.
            </p>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}
