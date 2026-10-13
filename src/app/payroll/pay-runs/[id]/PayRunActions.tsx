"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Run = { id: string; label: string; status: string };

const SUCCESS: Record<string, string> = {
  calculate: "Pay run calculated",
  approve: "Pay run approved",
  finalise: "Pay run finalised and marked paid",
  fail: "Pay run marked as failed",
};

/**
 * Workflow controls for a single pay run. Only buttons legal for the current
 * status are rendered; the server still re-checks every transition.
 */
export function PayRunActions({ run }: { run: Run }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmFinalise, setConfirmFinalise] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [reason, setReason] = useState("");

  const canCalculate = run.status === "DRAFT";
  const canApprove = run.status === "PENDING_APPROVAL";
  const canFinalise = run.status === "APPROVED";
  const canFail = run.status === "DRAFT" || run.status === "PENDING_APPROVAL";

  async function act(action: "calculate" | "approve" | "finalise" | "fail") {
    setBusy(true);
    setError("");
    const body = action === "fail" ? { action, reason: reason.trim() } : { action };
    const res = await apiCall<{ error?: string }>(
      `/api/payroll/pay-runs/${run.id}`,
      "PATCH",
      body,
      { silent: true }
    );
    setBusy(false);
    if (res.ok) {
      toast.success(SUCCESS[action] ?? "Pay run updated");
      setConfirmFinalise(false);
      setFailOpen(false);
      setReason("");
      router.refresh();
    } else {
      setError(res.data?.error ?? "Action failed");
    }
  }

  const noActions = !canCalculate && !canApprove && !canFinalise && !canFail;

  return (
    <div className="space-y-3">
      {canCalculate && (
        <div>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy}
            onClick={() => act("calculate")}
          >
            {busy ? "Working…" : "Calculate"}
          </button>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Creates a line per active employee and moves the run to pending approval.
          </p>
        </div>
      )}

      {canApprove && (
        <div>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy}
            onClick={() => act("approve")}
          >
            {busy ? "Working…" : "Approve"}
          </button>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Locks the totals and sends the run to be finalised.
          </p>
        </div>
      )}

      {canFinalise && (
        <div className="space-y-2">
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy}
            onClick={() => setConfirmFinalise(true)}
          >
            Finalise
          </button>
          {/* Finalising issues the payslips; this links to the dedicated
              payslip tooling for manual re-generation. */}
          <Link
            href={`/payroll/payslips/generate?payRun=${run.id}`}
            className="btn-secondary w-full"
          >
            Generate payslips
          </Link>
        </div>
      )}

      {canFail && (
        <button
          type="button"
          className="btn-danger w-full"
          disabled={busy}
          onClick={() => setFailOpen(true)}
        >
          Mark failed
        </button>
      )}

      {noActions && (
        <p className="text-xs text-slate-500">
          No workflow actions are available for a {run.status.replace(/_/g, " ").toLowerCase()} pay
          run.
        </p>
      )}

      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

      <Modal
        open={confirmFinalise}
        onClose={() => setConfirmFinalise(false)}
        title="Finalise this pay run?"
        subtitle={run.label}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Finalising issues a payslip for every line and marks the run as paid. This cannot be
            undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmFinalise(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => act("finalise")}
            >
              {busy ? "Finalising…" : "Finalise & mark paid"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={failOpen}
        onClose={() => setFailOpen(false)}
        title="Mark this pay run as failed?"
        subtitle={run.label}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            The run will stop progressing through the workflow. Add a reason so it appears in the
            audit trail.
          </p>
          <label className="block">
            <span className="label">Reason</span>
            <textarea
              rows={3}
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Missing timesheet approvals for 3 staff"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setFailOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={busy || reason.trim().length === 0}
              onClick={() => act("fail")}
            >
              {busy ? "Saving…" : "Mark failed"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
