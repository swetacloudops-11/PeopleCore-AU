"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export default function SyncNowButton({
  mappingId,
  organisationId,
  compact = false,
}: {
  mappingId?: string;
  organisationId?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiCall<{ status?: string; records?: number; durationMs?: number; error?: string }>(
        "/api/sync",
        "POST",
        { mappingId, organisationId },
        { silent: true }
      );

      if (res.ok) {
        const { status, records, durationMs } = res.data ?? {};
        if (status === "SUCCESS") {
          toast.success(`Sync complete — ${records} records in ${durationMs}ms`);
        } else if (status === "PARTIAL") {
          toast.error(`Sync partial — some records were rejected (${records} total)`);
        } else {
          toast.error(`Sync failed — ${res.data?.status ?? "unknown error"}`);
        }
        router.refresh();
      } else {
        toast.error(res.data?.error ?? "Could not start sync");
      }
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={run}
        disabled={busy}
        title="Run synchronisation now"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
      >
        {busy ? (
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="btn-secondary !py-1.5 text-xs"
    >
      {busy ? "Syncing…" : "Sync now"}
    </button>
  );
}
