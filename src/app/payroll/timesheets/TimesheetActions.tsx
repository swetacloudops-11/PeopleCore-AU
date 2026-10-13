"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/**
 * Approve / reject controls for a SUBMITTED timesheet. Rejection asks for a
 * reason first. Decisions PATCH /api/payroll/timesheets/[id].
 */
export function TimesheetActions({
  timesheet,
}: {
  timesheet: { id: string; label: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function decide(action: "approve" | "reject", why?: string) {
    setBusy(action);
    setError("");
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      `/api/payroll/timesheets/${timesheet.id}`,
      "PATCH",
      action === "reject" ? { action, reason: why?.trim() || undefined } : { action },
      { silent: true }
    );
    setBusy(null);

    if (res.ok) {
      toast.success(action === "approve" ? "Timesheet approved" : "Timesheet rejected");
      setRejecting(false);
      setReason("");
      router.refresh();
    } else {
      setError(
        res.data?.fields?.action ?? res.data?.fields?.reason ?? res.data?.error ?? "Could not save the decision"
      );
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setReason("");
            setError("");
            setRejecting(true);
          }}
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide("approve")}
          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
      </div>

      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject timesheet"
        subtitle={timesheet.label}
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="ts-reject-reason">
              Reason
            </label>
            <textarea
              id="ts-reject-reason"
              rows={3}
              className="input"
              placeholder="Tell the employee why this timesheet is being rejected…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setRejecting(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={busy !== null}
              onClick={() => decide("reject", reason)}
            >
              {busy === "reject" ? "Rejecting…" : "Reject timesheet"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
