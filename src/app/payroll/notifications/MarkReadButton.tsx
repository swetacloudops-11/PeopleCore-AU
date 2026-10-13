"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Marks every unread organisation notification as read via the shared endpoint. */
export default function MarkReadButton({ unread }: { unread: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    if (busy || unread === 0) return;
    setBusy(true);
    const res = await apiCall(
      "/api/org/notifications",
      "PATCH",
      { action: "read_all" },
      { silent: true }
    );
    setBusy(false);
    if (res.ok) {
      toast.success("All notifications marked as read");
      router.refresh();
    } else {
      toast.error("Could not mark notifications as read");
    }
  }

  return (
    <button
      type="button"
      onClick={markAll}
      disabled={busy || unread === 0}
      className="btn-primary !py-1.5 text-xs disabled:opacity-50"
    >
      {busy ? "Marking…" : unread === 0 ? "All read ✓" : `Mark all read (${unread})`}
    </button>
  );
}
