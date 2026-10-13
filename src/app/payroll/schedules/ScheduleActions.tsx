"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import ScheduleForm from "./ScheduleForm";

export type ScheduleActionItem = {
  id: string;
  name: string;
  frequency: string;
  payDay: number;
  nextRunDate: string | null;
  isActive: boolean;
};

/** Row actions for a pay schedule: edit (modal) and activate/deactivate. */
export default function ScheduleActions({ schedule }: { schedule: ScheduleActionItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await apiCall(`/api/payroll/schedules/${schedule.id}`, "PATCH", {
      isActive: !schedule.isActive,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(schedule.isActive ? "Pay schedule deactivated" : "Pay schedule activated");
      router.refresh();
    }
  }

  return (
    <div className="flex justify-end gap-1.5">
      <button
        type="button"
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
        onClick={() => setOpen(true)}
      >
        Edit
      </button>
      <button
        type="button"
        disabled={busy}
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        onClick={toggle}
      >
        {schedule.isActive ? "Deactivate" : "Activate"}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit pay schedule"
        subtitle={schedule.name}
      >
        <ScheduleForm
          id={schedule.id}
          initial={{
            name: schedule.name,
            frequency: schedule.frequency,
            payDay: schedule.payDay,
            nextRunDate: schedule.nextRunDate ?? "",
            isActive: schedule.isActive,
          }}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </div>
  );
}
