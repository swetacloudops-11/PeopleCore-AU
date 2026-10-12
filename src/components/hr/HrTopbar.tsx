"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { initials } from "@/lib/format";

type Notif = {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function HrTopbar({
  user,
  orgName,
  onToggleMobile,
}: {
  user: { name: string; email: string; roles: string[] };
  orgName: string;
  onToggleMobile?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/org/notifications")
      .then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((d) => {
        if (active) setItems(d.notifications ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const unread = items.filter((n) => !n.isRead).length;

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function markAllRead() {
    await fetch("/api/org/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_all" }),
    });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    router.refresh();
  }

  return (
    <header className="relative flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
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
        <span className="text-slate-400">Search employees, leave, documents…</span>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <span className="hidden rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 sm:inline">
          ● {orgName}
        </span>

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Notifications"
            aria-expanded={open}
          >
            🔔
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-800">Notifications</span>
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-xs text-sky-600 hover:underline"
                  >
                    Mark all read
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {items.length === 0 && (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">
                      You&apos;re all caught up.
                    </p>
                  )}
                  {items.map((n) => (
                    <Link
                      key={n.id}
                      href={n.linkUrl ?? "/hr/dashboard"}
                      onClick={() => setOpen(false)}
                      className={`block px-4 py-3 transition hover:bg-slate-50 ${
                        n.isRead ? "" : "bg-sky-50/40"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.isRead && (
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                        )}
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-slate-800">{n.title}</div>
                          <div className="mt-0.5 text-xs leading-snug text-slate-500">{n.body}</div>
                          <div className="mt-1 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <Link
          href="/hr/assistant"
          className="hidden items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 sm:inline-flex"
          title="Ask the HR assistant"
        >
          🤖 AI
        </Link>

        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-600 text-xs font-semibold text-white">
            {initials(user.name)}
          </span>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-medium text-slate-800">{user.name}</div>
            <div className="text-[11px] text-slate-500">{user.roles[0] ?? "HR_MANAGER"}</div>
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
