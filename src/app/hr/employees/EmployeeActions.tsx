"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import { EmployeeForm, type HrEmployeeRow, type HrOptions } from "./EmployeeForm";

/** Per-row view / edit / terminate controls for the All Employees table. */
export function EmployeeRowActions({
  employee,
  options,
}: {
  employee: HrEmployeeRow;
  options: HrOptions;
}) {
  const [editing, setEditing] = useState(false);
  const [terminating, setTerminating] = useState(false);

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Link
        href={`/hr/employees/${employee.id}`}
        className="rounded-md px-2 py-1 text-xs font-medium text-sky-600 hover:bg-sky-50"
      >
        View
      </Link>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
      >
        Edit
      </button>
      {employee.employmentStatus !== "TERMINATED" && (
        <button
          type="button"
          onClick={() => setTerminating(true)}
          className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
        >
          Terminate
        </button>
      )}

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${employee.firstName} ${employee.lastName}`}
        subtitle="Update employment details, role assignments and pay."
        width="max-w-2xl"
      >
        <EmployeeForm
          options={options}
          initial={employee}
          employeeId={employee.id}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </Modal>

      <TerminateModal
        open={terminating}
        onClose={() => setTerminating(false)}
        employee={employee}
      />
    </div>
  );
}

function TerminateModal({
  open,
  onClose,
  employee,
}: {
  open: boolean;
  onClose: () => void;
  employee: HrEmployeeRow;
}) {
  const router = useRouter();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/hr/employees/${employee.id}`, "PATCH", {
      employmentStatus: "TERMINATED",
      terminationDate: date,
      terminationReason: reason,
    });
    setBusy(false);
    if (!res.ok) return;
    toast.success(`${employee.firstName} ${employee.lastName} terminated`);
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Terminate ${employee.firstName} ${employee.lastName}`}
      subtitle="The employee record is kept and can be re-activated later."
    >
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="label">Termination date</span>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="label">Reason</span>
          <textarea
            rows={3}
            className="input"
            placeholder="e.g. Resignation — two weeks notice served"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-danger" disabled={busy}>
            {busy ? "Terminating…" : "Terminate employee"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
