"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Row action â€” an employee may cancel their own PENDING leave request. */
export function LeaveCancel({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    if (!window.confirm("Cancel this leave request?")) return;
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/employee/leave/${id}`, "PATCH", {
      status: "CANCELLED",
    });
    setBusy(false);
    if (!res.ok) return;
    toast.success("Leave request cancelled");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={cancel}
      disabled={busy}
      className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
    >
      {busy ? "Cancellingâ€¦" : "Cancel"}
    </button>
  );
}
