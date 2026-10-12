"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Result = { status?: string; records?: number };

/**
 * Triggers a sync run for the first few active organisations, giving the
 * Sync Logs table fresh rows to display.
 */
export default function BulkSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    if (!window.confirm("Run a synchronisation for 3 active organisations now?")) return;

    setBusy(true);
    try {
      const orgs = await apiCall<{ organisations?: Array<{ id: string; name: string }> }>(
        "/api/sync/targets",
        "GET"
      );

      const targets = (orgs.data?.organisations ?? []).slice(0, 3);
      if (targets.length === 0) {
        toast.error("No active organisations available to sync");
        return;
      }

      let ok = 0;
      let failed = 0;
      for (const org of targets) {
        const res = await apiCall<Result>("/api/sync", "POST", { organisationId: org.id }, { silent: true });
        if (res.ok && res.data?.status === "SUCCESS") ok++;
        else failed++;
      }

      if (failed === 0) toast.success(`Sync complete — ${ok}/${targets.length} succeeded`);
      else if (ok === 0) toast.error(`Sync failed for all ${targets.length} organisations`);
      else toast.error(`Sync partially complete — ${ok} succeeded, ${failed} failed`);

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={run} disabled={busy} className="btn-primary">
      {busy ? (
        <span className="inline-flex items-center gap-2">
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Syncing…
        </span>
      ) : (
        "↻ Run sync"
      )}
    </button>
  );
}
