"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type EmployeeOption = { id: string; name: string };

type RecordProps = {
  id: string;
  clockIn: string; // "HH:MM"
  clockOut: string; // "HH:MM"
  breakMinutes: number;
  status: string;
  notes: string;
  label: string;
};

const STATUSES = ["PRESENT", "LATE", "HALF_DAY", "ABSENT", "ON_LEAVE", "REMOTE", "MISSING"];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * One component for both entry points: pass `employees` for the header
 * "Add attendance" button, or `record` for a row-level "Edit" button.
 */
export default function AttendanceActions({
  employees,
  record,
}: {
  employees?: EmployeeOption[];
  record?: RecordProps;
}) {
  const router = useRouter();
  const isEdit = Boolean(record);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employeeId: employees?.[0]?.id ?? "",
    date: todayISO(),
    clockIn: record?.clockIn || "08:30",
    clockOut: record?.clockOut || "17:00",
    breakMinutes: String(record?.breakMinutes ?? 30),
    status: record?.status ?? "PRESENT",
    notes: record?.notes ?? "",
  });
  const [error, setError] = useState("");

  async function submit() {
    setSaving(true);
    setError("");
    const payload = {
      clockIn: form.clockIn || null,
      clockOut: form.clockOut || null,
      breakMinutes: Number(form.breakMinutes) || 0,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    const res = isEdit
      ? await apiCall(`/api/org/time/${record!.id}`, "PATCH", { type: "attendance", ...payload })
      : await apiCall("/api/org/time", "POST", {
          type: "attendance",
          employeeId: form.employeeId,
          date: form.date,
          ...payload,
        });

    setSaving(false);
    if (res.ok) {
      toast.success(isEdit ? "Attendance updated" : "Attendance recorded");
      setOpen(false);
      router.refresh();
    } else {
      const fields = (res.data as { fields?: Record<string, string> })?.fields;
      setError(fields ? Object.values(fields)[0] ?? "Could not save" : "Could not save");
    }
  }

  if (!isEdit && (!employees || employees.length === 0)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={isEdit ? "btn-secondary !px-2 !py-1 text-[11px]" : "btn-primary"}
      >
        {isEdit ? "Edit" : "+ Add attendance"}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? "Edit attendance" : "Add attendance"}
        subtitle={isEdit ? record!.label : "Record a manual clock entry for an employee"}
      >
        <div className="space-y-4">
          {!isEdit && (
            <div>
              <label className="label" htmlFor="att-emp">Employee</label>
              <select
                id="att-emp"
                className="input"
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              >
                {employees!.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}

          {!isEdit && (
            <div>
              <label className="label" htmlFor="att-date">Date</label>
              <input
                id="att-date"
                type="date"
                className="input"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="att-in">Clock in</label>
              <input
                id="att-in"
                type="time"
                className="input"
                value={form.clockIn}
                onChange={(e) => setForm({ ...form, clockIn: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="att-out">Clock out</label>
              <input
                id="att-out"
                type="time"
                className="input"
                value={form.clockOut}
                onChange={(e) => setForm({ ...form, clockOut: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="att-break">Break (minutes)</label>
              <input
                id="att-break"
                type="number"
                min={0}
                max={600}
                className="input"
                value={form.breakMinutes}
                onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="att-status">Status</label>
              <select
                id="att-status"
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="att-notes">Notes</label>
            <textarea
              id="att-notes"
              className="input"
              rows={2}
              placeholder="Optional context…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Record attendance"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
