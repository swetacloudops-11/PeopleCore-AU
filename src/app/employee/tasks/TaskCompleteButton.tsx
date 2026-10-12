"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Marks one of the signed-in person's own open tasks as COMPLETED. */
export default function TaskCompleteButton({
  id,
  compact = false,
}: {
  id: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function complete() {
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/employee/tasks/${id}`, "PATCH", {
      status: "COMPLETED",
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Task marked complete");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={complete}
      disabled={busy}
      className={compact ? "btn-primary !px-2 !py-1 text-[11px]" : "btn-primary"}
    >
      {busy ? "Saving…" : "Mark complete"}
    </button>
  );
}
