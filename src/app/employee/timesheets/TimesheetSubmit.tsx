"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Props = {
  id: string;
  /** Already-formatted period, e.g. "06 Oct 2026 – 12 Oct 2026". */
  periodLabel: string;
  totalHours: number;
};

/** Submit button for a DRAFT timesheet row — opens a confirm dialog, then PATCHes. */
export default function TimesheetSubmit({ id, periodLabel, totalHours }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    const res = await apiCall<{ ok?: boolean }>(
      `/api/employee/timesheets/${id}`,
      "PATCH",
      { action: "submit" }
    );
    if (res.ok) {
      toast.success("Timesheet submitted for approval");
      setOpen(false);
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        className="btn-secondary !py-1.5 text-xs"
        onClick={() => setOpen(true)}
        disabled={busy}
      >
        Submit
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Submit timesheet"
        subtitle={periodLabel}
        width="max-w-md"
      >
        <p className="text-sm text-slate-600">
          Submit{" "}
          <span className="font-semibold tabular-nums text-slate-900">
            {totalHours.toFixed(2)}h
          </span>{" "}
          for approval? Once submitted you won&apos;t be able to edit it again.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Submitting…" : "Submit timesheet"}
          </button>
        </div>
      </Modal>
    </>
  );
}
