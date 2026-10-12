"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Cell = {
  id?: string;
  employeeId: string;
  employeeName: string;
  dayOfWeek: number;
  dayLabel: string;
  isAvailable: boolean;
  startTime: string;
  endTime: string;
  hasRecord: boolean;
  note: string;
};

const DAYS = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
  { dow: 6, label: "Saturday" },
  { dow: 0, label: "Sunday" },
];

/** One matrix cell — click to open the availability modal for that day. */
export default function AvailabilityCell({ cell }: { cell: Cell }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    dayOfWeek: String(cell.dayOfWeek),
    isAvailable: cell.hasRecord ? cell.isAvailable : true,
    startTime: cell.startTime,
    endTime: cell.endTime,
    note: cell.note,
  });

  const unavailable = cell.hasRecord && !cell.isAvailable;

  async function submit() {
    setSaving(true);
    setError("");
    const res = await apiCall(`/api/org/availability/${cell.id ?? "new"}`, "PATCH", {
      employeeId: cell.employeeId,
      dayOfWeek: Number(form.dayOfWeek),
      startTime: form.isAvailable ? form.startTime : null,
      endTime: form.isAvailable ? form.endTime : null,
      isAvailable: form.isAvailable,
      note: form.note.trim() || null,
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Availability saved");
      setOpen(false);
      router.refresh();
    } else {
      const fields = (res.data as { fields?: Record<string, string> })?.fields;
      setError(fields ? Object.values(fields)[0] ?? "Could not save" : "Could not save");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full rounded-md border px-1.5 py-1 text-[11px] leading-tight transition ${
          !cell.hasRecord
            ? "border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
            : unavailable
              ? "border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100"
              : "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        }`}
        title={`${cell.employeeName} · ${cell.dayLabel}`}
      >
        {!cell.hasRecord ? (
          "Set"
        ) : unavailable ? (
          "Unavailable"
        ) : (
          <span className="tabular-nums">
            {cell.startTime ?? "—"}–{cell.endTime ?? "—"}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit availability"
        subtitle={`${cell.employeeName} · ${cell.dayLabel}`}
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="av-day">Day</label>
            <select
              id="av-day"
              className="input"
              value={form.dayOfWeek}
              onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
            >
              {DAYS.map((d) => (
                <option key={d.dow} value={d.dow}>{d.label}</option>
              ))}
            </select>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
              checked={form.isAvailable}
              onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
            />
            Available to work this day
          </label>

          {form.isAvailable && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="av-start">Start time</label>
                <input
                  id="av-start"
                  type="time"
                  className="input"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="av-end">End time</label>
                <input
                  id="av-end"
                  type="time"
                  className="input"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </div>
            </div>
          )}

          <div>
            <label className="label" htmlFor="av-note">Note</label>
            <input
              id="av-note"
              className="input"
              placeholder="Optional note…"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>

          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
              {saving ? "Saving…" : "Save availability"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
