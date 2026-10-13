"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/**
 * Confirms and issues the POST that pre-creates payslip rows for a pay run's
 * lines. Server-side this is idempotent (unique payRunId + employeeId).
 */
export function GeneratePayslipsButton({
  payRunId,
  label,
  pending,
}: {
  payRunId: string;
  label: string;
  pending: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const complete = pending <= 0;

  async function generate() {
    setBusy(true);
    const res = await apiCall<{ created?: number; error?: string }>(
      "/api/payroll/payslips",
      "POST",
      { payRunId },
      { silent: true }
    );
    setBusy(false);
    if (res.ok) {
      const created = res.data?.created ?? 0;
      toast.success(
        created > 0
          ? `${created} payslip${created === 1 ? "" : "s"} generated`
          : "No new payslips to generate"
      );
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.data?.error ?? "Could not generate payslips");
    }
  }

  if (complete) {
    return (
      <span className="text-[11px] font-medium text-emerald-600">
        ✓ All payslips generated
      </span>
    );
  }

  return (
    <>
      <button type="button" className="btn-primary !py-1.5 text-xs" onClick={() => setOpen(true)}>
        Generate payslips
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Generate payslips?"
        subtitle={label}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This pre-creates {pending} issued payslip{pending === 1 ? "" : "s"} from the
            run&apos;s {pending === 1 ? "line" : "lines"}. Existing payslips for this run
            are left untouched.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={generate}>
              {busy ? "Generating…" : "Generate payslips"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
