"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Posts the calculate action for one draft pay run. */
export function CalculateButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const res = await apiCall<{ error?: string }>(
      `/api/payroll/pay-runs/${id}`,
      "PATCH",
      { action: "calculate" },
      { silent: true }
    );
    setBusy(false);
    if (res.ok) {
      toast.success("Pay run calculated");
      router.refresh();
    } else {
      toast.error(res.data?.error ?? "Could not calculate the pay run");
    }
  }

  return (
    <button type="button" className="btn-primary !py-1.5 text-xs" disabled={busy} onClick={run}>
      {busy ? "Calculating…" : "Calculate now"}
    </button>
  );
}
