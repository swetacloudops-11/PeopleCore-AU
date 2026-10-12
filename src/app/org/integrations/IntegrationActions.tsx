"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Connect / disconnect / remove one of this organisation's mappings. */
export function MappingActions({
  id,
  status,
  name,
}: {
  id: string;
  status: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(next: "CONNECTED" | "DISCONNECTED") {
    const verb = next === "CONNECTED" ? "Connect" : "Disconnect";
    if (!window.confirm(`${verb} ${name}?`)) return;
    setBusy(true);
    const res = await apiCall(`/api/org/integrations/${id}`, "PATCH", { status: next });
    setBusy(false);
    if (res.ok) {
      toast.success(`${verb}ed ${name}`);
      router.refresh();
    }
  }

  async function remove() {
    if (!window.confirm(`Remove the ${name} mapping for this organisation?`)) return;
    if (!window.confirm("Sync history stays, but the connection settings are lost. Continue?"))
      return;
    setBusy(true);
    const res = await apiCall(`/api/org/integrations/${id}`, "DELETE");
    setBusy(false);
    if (res.ok) {
      toast.success(`Removed ${name}`);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {status !== "CONNECTED" && (
        <button
          type="button"
          onClick={() => setStatus("CONNECTED")}
          disabled={busy}
          className="rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40"
        >
          Connect
        </button>
      )}
      {status === "CONNECTED" && (
        <button
          type="button"
          onClick={() => setStatus("DISCONNECTED")}
          disabled={busy}
          className="rounded-md border border-amber-200 px-2 py-1 text-[11px] font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-40"
        >
          Disconnect
        </button>
      )}
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
      >
        Remove
      </button>
    </div>
  );
}

/** Maps a catalogue integration onto this organisation. */
export function ConnectButton({ integrationId, name }: { integrationId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    const res = await apiCall<{ error?: string }>("/api/org/integrations", "POST", {
      integrationId,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`Connected ${name}`);
      router.refresh();
    }
  }

  return (
    <button type="button" onClick={connect} disabled={busy} className="btn-secondary !py-1.5 text-xs">
      {busy ? "Connecting…" : "Connect"}
    </button>
  );
}
