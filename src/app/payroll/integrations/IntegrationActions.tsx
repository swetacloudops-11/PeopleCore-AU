"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import Modal from "@/components/Modal";

type SyncResult = {
  status?: string;
  records?: number;
  success?: number;
  durationMs?: number;
  message?: string;
  error?: string;
};

/**
 * Per-integration actions for the Payroll console.
 *
 * - Sync now  → POST /api/org/integrations/sync with `{ integrationId }`
 *   (we also forward this org's mapping id so the existing endpoint targets
 *   the right connection rather than falling back to the first one).
 * - Connect / Disconnect → PATCH /api/org/integrations/[id] with `{ status }`.
 */
export default function IntegrationActions({
  id,
  integrationId,
  name,
  status,
}: {
  id: string;
  integrationId: string;
  name: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function syncNow() {
    if (busy) return;
    setBusy(true);
    const res = await apiCall<SyncResult>(
      "/api/org/integrations/sync",
      "POST",
      { integrationId, mappingId: id },
      { silent: true }
    );
    setBusy(false);

    if (!res.ok) {
      toast.error(res.data?.error ?? "Could not start the sync");
      return;
    }
    const d = res.data;
    if (d.status === "SUCCESS") {
      toast.success(`Sync complete — ${d.records ?? 0} records in ${d.durationMs ?? 0}ms`);
    } else if (d.status === "PARTIAL") {
      toast.error(`Sync partial — some records were rejected (${d.records ?? 0} total)`);
    } else if (d.status === "SKIPPED") {
      toast.info("Sync skipped — the connection is disconnected");
    } else {
      toast.error(d.message ?? "Sync failed");
    }
    router.refresh();
  }

  async function setStatus(next: "CONNECTED" | "DISCONNECTED") {
    if (busy) return;
    setConfirmOpen(false);
    setBusy(true);
    const res = await apiCall(`/api/org/integrations/${id}`, "PATCH", { status: next }, { silent: true });
    setBusy(false);
    if (res.ok) {
      toast.success(next === "CONNECTED" ? `Connected ${name}` : `Disconnected ${name}`);
      router.refresh();
    } else {
      toast.error(`Could not ${next === "CONNECTED" ? "connect" : "disconnect"} ${name}`);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "DISCONNECTED" && (
        <button
          type="button"
          onClick={syncNow}
          disabled={busy}
          className="btn-secondary !py-1.5 text-xs disabled:opacity-40"
        >
          {busy ? "Working…" : "Sync now"}
        </button>
      )}

      {status !== "CONNECTED" ? (
        <button
          type="button"
          onClick={() => setStatus("CONNECTED")}
          disabled={busy}
          className="rounded-md border border-emerald-200 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40"
        >
          Connect
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
          className="rounded-md border border-amber-200 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-40"
        >
          Disconnect
        </button>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Disconnect ${name}?`}
        subtitle="Scheduled syncs will stop until you reconnect. Existing sync history is kept."
      >
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmOpen(false)} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setStatus("DISCONNECTED")}
            disabled={busy}
            className="btn-danger disabled:opacity-50"
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
