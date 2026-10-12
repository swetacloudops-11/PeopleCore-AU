"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import { EmployeeModal, type EmployeeRow, type OrgOptions } from "../EmployeeForm";

/** Edit + terminate controls for the employee profile page. */
export function DetailActions({
  employee,
  options,
}: {
  employee: EmployeeRow;
  options: OrgOptions;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const terminated = employee.employmentStatus === "TERMINATED";

  return (
    <div className="flex items-center gap-2">
      <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
        Edit
      </button>
      {!terminated ? (
        <button type="button" className="btn-danger" onClick={() => setTerminating(true)}>
          Terminate
        </button>
      ) : (
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            const res = await apiCall(`/api/org/employees/${employee.id}`, "PATCH", {
              employmentStatus: "ACTIVE",
            });
            if (res.ok) {
              toast.success("Employee re-activated");
              router.refresh();
            }
          }}
        >
          Re-activate
        </button>
      )}

      <EmployeeModal
        open={editing}
        onClose={() => setEditing(false)}
        employee={employee}
        options={options}
      />
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
  employee: EmployeeRow;
}) {
  const router = useRouter();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/org/employees/${employee.id}`, "PATCH", {
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
