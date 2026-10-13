"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Approves a single pending pay run. */
export function ApproveButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    const res = await apiCall<{ error?: string }>(
      `/api/payroll/pay-runs/${id}`,
      "PATCH",
      { action: "approve" },
      { silent: true }
    );
    setBusy(false);
    if (res.ok) {
      toast.success("Pay run approved");
      router.refresh();
    } else {
      toast.error(res.data?.error ?? "Could not approve the pay run");
    }
  }

  return (
    <button type="button" className="btn-primary !py-1.5 text-xs" disabled={busy} onClick={approve}>
      {busy ? "Approving…" : "Approve"}
    </button>
  );
}
