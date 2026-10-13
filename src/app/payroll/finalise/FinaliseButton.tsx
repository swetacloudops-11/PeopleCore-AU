"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Confirms and finalises one approved pay run (issues payslips, marks paid). */
export function FinaliseButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function finalise() {
    setBusy(true);
    const res = await apiCall<{ error?: string }>(
      `/api/payroll/pay-runs/${id}`,
      "PATCH",
      { action: "finalise" },
      { silent: true }
    );
    setBusy(false);
    if (res.ok) {
      toast.success("Pay run finalised and marked paid");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.data?.error ?? "Could not finalise the pay run");
    }
  }

  return (
    <>
      <button type="button" className="btn-primary !py-1.5 text-xs" onClick={() => setOpen(true)}>
        Finalise &amp; mark paid
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Finalise this pay run?"
        subtitle={label}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            A payslip will be issued for every line and the run will be marked as paid. This cannot
            be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={finalise}>
              {busy ? "Finalising…" : "Finalise & mark paid"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
