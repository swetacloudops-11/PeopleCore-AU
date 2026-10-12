"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Mark an acknowledgement as acknowledged or waive it. */
export default function AckActions({
  policyId,
  acknowledgementId,
  status,
}: {
  policyId: string;
  acknowledgementId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async (action: "acknowledge" | "waive", message: string) => {
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/org/policies/${policyId}`, "PATCH", {
      action,
      acknowledgementId,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(message);
      router.refresh();
    }
  };

  if (status === "ACKNOWLEDGED") {
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
        ✓ Acknowledged
      </span>
    );
  }

  if (status === "WAIVED") {
    return (
      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
        — Waived
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => run("acknowledge", "Marked as acknowledged")}
        className="btn-primary !px-2 !py-1 text-[11px]"
      >
        Acknowledge
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => run("waive", "Acknowledgement waived")}
        className="btn-secondary !px-2 !py-1 text-[11px]"
      >
        Waive
      </button>
    </div>
  );
}
