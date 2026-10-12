"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { initials } from "@/lib/format";

export default function Topbar({
  user,
  onToggleMobile,
}: {
  user: { name: string; email: string; roles: string[] };
  onToggleMobile?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      <button
        type="button"
        onClick={onToggleMobile}
        className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 text-slate-600 md:hidden"
        aria-label="Toggle navigation"
      >
        ☰
      </button>

      <div className="hidden items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-500 sm:flex">
        <span>🔍</span>
        <span className="text-slate-400">Search organisations, plans, logs…</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 sm:inline">
          ● Platform operational
        </span>

        <Link
          href="/settings"
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          title="Settings"
        >
          ⚙️
        </Link>

        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
            {initials(user.name)}
          </span>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-medium text-slate-800">{user.name}</div>
            <div className="text-[11px] text-slate-500">
              {user.roles[0] ?? "SUPER_ADMIN"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          disabled={busy}
          className="btn-secondary !py-1.5 text-xs"
        >
          {busy ? "…" : "Sign out"}
        </button>
      </div>
    </header>
  );
}
