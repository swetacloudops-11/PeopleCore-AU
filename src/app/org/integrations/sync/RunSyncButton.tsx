"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type SyncResult = {
  status?: string;
  records?: number;
  success?: number;
  durationMs?: number;
  message?: string;
  error?: string;
};

/** Kicks off a synchronisation run for this organisation. */
export default function RunSyncButton({
  mappings,
}: {
  mappings: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [mappingId, setMappingId] = useState("");
  const [direction, setDirection] = useState("BIDIRECTIONAL");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const res = await apiCall<SyncResult>("/api/org/integrations/sync", "POST", {
      direction,
      ...(mappingId ? { mappingId } : {}),
    });
    setBusy(false);

    if (res.ok) {
      const d = res.data;
      toast.success(`Sync ${d.status} — ${d.success}/${d.records} records in ${d.durationMs}ms`);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="input !w-auto !py-1.5 text-xs"
        value={mappingId}
        onChange={(e) => setMappingId(e.target.value)}
        aria-label="Integration to sync"
        disabled={busy}
      >
        <option value="">Auto (connected integration)</option>
        {mappings.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select
        className="input !w-auto !py-1.5 text-xs"
        value={direction}
        onChange={(e) => setDirection(e.target.value)}
        aria-label="Sync direction"
        disabled={busy}
      >
        <option value="BIDIRECTIONAL">Both ways</option>
        <option value="INBOUND">Inbound</option>
        <option value="OUTBOUND">Outbound</option>
      </select>

      <button type="button" className="btn-primary !py-1.5 text-xs" onClick={run} disabled={busy}>
        {busy ? "Syncing…" : "▶ Run sync"}
      </button>
    </div>
  );
}
