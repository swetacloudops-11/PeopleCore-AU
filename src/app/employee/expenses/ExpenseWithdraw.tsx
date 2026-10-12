"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Row action â€” an employee may withdraw their own PENDING expense claim (back to DRAFT). */
export function ExpenseWithdraw({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function withdraw() {
    if (!window.confirm("Withdraw this expense claim?")) return;
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/employee/expenses/${id}`, "PATCH", {
      action: "withdraw",
    });
    setBusy(false);
    if (!res.ok) return;
    toast.success("Claim withdrawn");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={withdraw}
      disabled={busy}
      className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
    >
      {busy ? "Withdrawingâ€¦" : "Withdraw"}
    </button>
  );
}
