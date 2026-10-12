"use client";

import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export default function JobActions({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: string;
}) {
  const router = useRouter();

  async function act(action: "RETRY" | "CANCEL") {
    const prompt =
      action === "RETRY"
        ? `Requeue job "${name}"?`
        : `Cancel the running/queued job "${name}"?`;
    if (!window.confirm(prompt)) return;

    const res = await apiCall<{ error?: string }>(`/api/jobs/${id}`, "PATCH", { action });
    if (res.ok) {
      toast.success(action === "RETRY" ? `"${name}" requeued` : `"${name}" cancelled`);
      router.refresh();
    }
  }

  const canRetry = status === "FAILED" || status === "CANCELLED" || status === "SUCCEEDED";
  const canCancel = status === "QUEUED" || status === "RUNNING";

  if (!canRetry && !canCancel) return null;

  return (
    <div className="flex justify-end gap-1.5">
      {canCancel && (
        <button
          type="button"
          onClick={() => act("CANCEL")}
          className="rounded-md border border-amber-200 px-2 py-1 text-[11px] font-medium text-amber-700 transition hover:bg-amber-50"
        >
          Cancel
        </button>
      )}
      {canRetry && (
        <button
          type="button"
          onClick={() => act("RETRY")}
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Retry
        </button>
      )}
    </div>
  );
}
