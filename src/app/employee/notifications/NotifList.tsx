"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { apiCall } from "@/lib/client-api";
import { Badge, EmptyState } from "@/components/ui";
import { timeAgo } from "@/lib/format";

/** Plain serialisable row — Dates converted to ISO strings by the server page. */
export type NotifRow = {
  id: string;
  title: string;
  body: string;
  event: string;
  channel: string;
  isRead: boolean;
  linkUrl: string | null;
  createdAt: string;
};

/** Badge tone per notification family — Badge tones only (never chart tones). */
function eventTone(event: string): string {
  if (event.startsWith("SHIFT")) return "blue";
  if (event.startsWith("LEAVE")) return "amber";
  if (event.startsWith("PAYSLIP") || event.startsWith("PAYRUN")) return "green";
  if (event.startsWith("ANNOUNCE")) return "purple";
  return "slate";
}

/**
 * The interactive notifications list: click a row to mark it read and follow
 * its link, or mark everything read in one go. Server truth (row.isRead) is
 * overlaid with optimistic local state so dots respond instantly.
 */
export default function NotifList({
  rows,
  emptyTitle = "No notifications",
  emptyHint,
}: {
  rows: NotifRow[];
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const router = useRouter();
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const isRead = (n: NotifRow) => marked[n.id] ?? n.isRead;
  const unreadCount = rows.filter((n) => !isRead(n)).length;

  /** Mark one read (optimistic + PATCH), then follow the row's link. */
  async function openNotification(n: NotifRow) {
    if (busyId) return;
    setBusyId(n.id);
    if (!isRead(n)) setMarked((m) => ({ ...m, [n.id]: true }));
    await apiCall("/api/employee/notifications", "PATCH", { action: "read", id: n.id });
    setBusyId(null);
    if (!n.linkUrl) return;
    if (n.linkUrl.startsWith("/")) router.push(n.linkUrl);
    else window.location.assign(n.linkUrl);
  }

  async function markAllRead() {
    if (busyAll || unreadCount === 0) return;
    setBusyAll(true);
    const unreadIds = rows.filter((n) => !isRead(n)).map((n) => n.id);
    setMarked((m) => ({ ...m, ...Object.fromEntries(unreadIds.map((id) => [id, true])) }));
    const res = await apiCall<{ ok?: boolean }>(
      "/api/employee/notifications",
      "PATCH",
      { action: "read_all" }
    );
    setBusyAll(false);
    if (res.ok) {
      toast.success("All notifications marked as read");
      router.refresh();
    } else {
      // Revert the optimistic dots — the server still has them unread.
      setMarked((m) => {
        const next = { ...m };
        for (const id of unreadIds) delete next[id];
        return next;
      });
    }
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {rows.length} notification{rows.length === 1 ? "" : "s"} · {unreadCount} unread
        </p>
        <button
          type="button"
          onClick={markAllRead}
          disabled={busyAll || unreadCount === 0}
          className="btn-secondary !py-1.5 text-xs disabled:opacity-50"
        >
          {busyAll ? "Marking…" : unreadCount === 0 ? "All read ✓" : `Mark all read (${unreadCount})`}
        </button>
      </div>

      <div className="card divide-y divide-slate-100">
        {rows.map((n) => {
          const read = isRead(n);
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => openNotification(n)}
              disabled={busyId === n.id}
              title={n.linkUrl ? "Open" : undefined}
              className="group flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${read ? "bg-slate-200" : "bg-violet-500"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[13px] ${
                      read ? "font-medium text-slate-700" : "font-semibold text-slate-900"
                    }`}
                  >
                    {n.title}
                  </span>
                  <Badge tone={eventTone(n.event)}>{n.event.replace(/_/g, " ")}</Badge>
                  <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                    {timeAgo(n.createdAt)}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-500">{n.body}</span>
                <span className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
                  <span>{n.channel.toLowerCase().replace("_", " ")}</span>
                  {n.linkUrl && (
                    <span className="font-medium text-violet-600 group-hover:underline">Open →</span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
