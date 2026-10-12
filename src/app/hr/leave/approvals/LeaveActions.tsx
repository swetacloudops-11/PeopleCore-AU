"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/**
 * Approve / reject controls for a pending leave request. Posts the decision to
 * /api/hr/leave/[id] and refreshes the server-rendered queue.
 */
export function LeaveActions({
  request,
}: {
  request: { id: string; label: string };
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [notes, setNotes] = useState("");
  const [fieldError, setFieldError] = useState("");

  async function review(status: "APPROVED" | "REJECTED", reviewNotes: string | null) {
    setBusy(status);
    setFieldError("");
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      `/api/hr/leave/${request.id}`,
      "PATCH",
      { status, reviewNotes }
    );
    setBusy(null);

    if (res.ok) {
      toast.success(status === "APPROVED" ? "Leave approved" : "Leave rejected");
      setRejecting(false);
      setNotes("");
      router.refresh();
    } else {
      setFieldError(res.data?.fields?.status ?? res.data?.error ?? "Could not save the decision");
    }
  }

  return (
    <>
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          disabled={busy !== null}
          onClick={() => {
            setNotes("");
            setFieldError("");
            setRejecting(true);
          }}
        >
          Reject
        </button>
        <button
          type="button"
          className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
          disabled={busy !== null}
          onClick={() => review("APPROVED", null)}
        >
          {busy === "APPROVED" ? "Approving…" : "Approve"}
        </button>
      </div>

      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject leave"
        subtitle={request.label}
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="lv-reject-notes">
              Notes
            </label>
            <textarea
              id="lv-reject-notes"
              rows={3}
              className="input"
              placeholder="Tell the employee why this request is being declined…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {fieldError && (
              <p className="mt-1 text-xs font-medium text-rose-600">{fieldError}</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setRejecting(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy !== null}
              onClick={() => review("REJECTED", notes.trim() || null)}
            >
              {busy === "REJECTED" ? "Saving…" : "Reject leave"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
