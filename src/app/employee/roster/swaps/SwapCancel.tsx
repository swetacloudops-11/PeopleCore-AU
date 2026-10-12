"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/**
 * Cancels one of the caller's own PENDING swap requests via
 * PATCH /api/employee/swaps/[id].
 */
export default function SwapCancel({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancel() {
    setBusy(true);
    setError("");
    const res = await apiCall<{ error?: string }>(
      `/api/employee/swaps/${requestId}`,
      "PATCH",
      { status: "CANCELLED" }
    );
    setBusy(false);

    if (res.ok) {
      toast.success("Swap request cancelled");
      setOpen(false);
      router.refresh();
    } else {
      setError(res.data?.error ?? "Could not cancel the request");
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-danger !px-2 !py-1 text-[11px]"
        disabled={busy}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Cancel
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel swap request"
        subtitle="This withdraws the request — you can submit a new one later."
        width="max-w-md"
      >
        <div className="space-y-4">
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Keep request
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={cancel}
              disabled={busy}
            >
              {busy ? "Cancelling…" : "Cancel request"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
