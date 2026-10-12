"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Option = { id: string; name: string };
type TypeOption = Option & { colour: string };

const daysBetween = (start: string, end: string) => {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return null;
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
};

/** Row-level approve / reject with a notes modal. */
export function LeaveActions({
  request,
}: {
  request: { id: string; status: string; label: string };
}) {
  const router = useRouter();
  const [action, setAction] = useState<"APPROVE" | "REJECT" | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (request.status !== "PENDING" && request.status !== "DRAFT") return null;

  async function confirm() {
    if (!action) return;
    setSaving(true);
    const res = await apiCall(`/api/org/leave/${request.id}`, "PATCH", {
      action,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (res.ok) {
      toast.success(action === "APPROVE" ? "Leave approved" : "Leave rejected");
      setAction(null);
      setNotes("");
      router.refresh();
    }
  }

  return (
    <>
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
          onClick={() => {
            setAction("REJECT");
            setNotes("");
          }}
        >
          Reject
        </button>
        <button
          type="button"
          className="rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50"
          onClick={() => {
            setAction("APPROVE");
            setNotes("");
          }}
        >
          Approve
        </button>
      </div>

      <Modal
        open={action !== null}
        onClose={() => setAction(null)}
        title={action === "APPROVE" ? "Approve leave" : "Reject leave"}
        subtitle={request.label}
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="leave-notes">Notes</label>
            <textarea
              id="leave-notes"
              rows={3}
              className="input"
              placeholder={
                action === "APPROVE"
                  ? "Optional note for the employee…"
                  : "Tell the employee why this request is being declined…"
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAction(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={action === "APPROVE" ? "btn-primary" : "btn-danger"}
              disabled={saving}
              onClick={confirm}
            >
              {saving
                ? "Saving…"
                : action === "APPROVE"
                  ? "Approve leave"
                  : "Reject leave"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Header button that lodges a leave request on behalf of an employee. */
export function NewLeaveRequest({
  employees,
  leaveTypes,
}: {
  employees: Option[];
  leaveTypes: TypeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    employeeId: employees[0]?.id ?? "",
    leaveTypeId: leaveTypes[0]?.id ?? "",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const preview = daysBetween(form.startDate, form.endDate);

  async function submit() {
    if (!form.startDate || !form.endDate) {
      setError("Choose the leave dates");
      return;
    }
    setSaving(true);
    setError("");
    const res = await apiCall("/api/org/leave", "POST", {
      employeeId: form.employeeId,
      leaveTypeId: form.leaveTypeId,
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason.trim() || null,
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Leave request lodged");
      setOpen(false);
      setForm({ ...form, startDate: "", endDate: "", reason: "" });
      router.refresh();
    } else {
      const fields = (res.data as { fields?: Record<string, string> })?.fields;
      setError(fields ? Object.values(fields)[0] ?? "Could not save" : "Could not save");
    }
  }

  if (employees.length === 0 || leaveTypes.length === 0) return null;

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + New leave request
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New leave request"
        subtitle="Lodge leave on behalf of an employee"
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="nl-emp">Employee</label>
            <select
              id="nl-emp"
              className="input"
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="nl-type">Leave type</label>
            <select
              id="nl-type"
              className="input"
              value={form.leaveTypeId}
              onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}
            >
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="nl-start">Start date</label>
              <input
                id="nl-start"
                type="date"
                className="input"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="nl-end">End date</label>
              <input
                id="nl-end"
                type="date"
                className="input"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500">
            {preview === null
              ? "Select both dates to see the leave length."
              : preview === 1
                ? "1 day of leave."
                : `${preview} days of leave.`}
          </p>

          <div>
            <label className="label" htmlFor="nl-reason">Reason</label>
            <textarea
              id="nl-reason"
              rows={2}
              className="input"
              placeholder="Optional…"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>

          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
              {saving ? "Lodging…" : "Lodge request"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
