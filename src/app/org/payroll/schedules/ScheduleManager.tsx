"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Schedule = {
  id: string;
  name: string;
  frequency: string;
  payDay: number;
  nextRunDate: string | null;
  isActive: boolean;
  payRunCount: number;
};

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const FREQUENCIES = ["WEEKLY", "FORTNIGHTLY", "MONTHLY"];

const EMPTY = {
  name: "",
  frequency: "FORTNIGHTLY",
  payDay: 4,
  nextRunDate: "",
  isActive: true,
};

function ScheduleForm({
  form,
  setForm,
  error,
}: {
  form: typeof EMPTY;
  setForm: (f: typeof EMPTY) => void;
  error: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="ps-name">Name</label>
        <input
          id="ps-name"
          className="input"
          placeholder="e.g. Fortnightly Salaried"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ps-freq">Frequency</label>
          <select
            id="ps-freq"
            className="input"
            value={form.frequency}
            onChange={(e) => setForm({ ...form, frequency: e.target.value })}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ps-day">Pay day</label>
          <select
            id="ps-day"
            className="input"
            value={form.payDay}
            onChange={(e) => setForm({ ...form, payDay: Number(e.target.value) })}
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="ps-next">Next run date</label>
        <input
          id="ps-next"
          type="date"
          className="input"
          value={form.nextRunDate}
          onChange={(e) => setForm({ ...form, nextRunDate: e.target.value })}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        Active — include this schedule in payroll runs
      </label>

      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

/** Header button that creates a pay schedule. */
export function NewScheduleButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ ...EMPTY });

  async function submit() {
    if (form.name.trim().length < 2) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/org/pay-schedules",
      "POST",
      {
        name: form.name.trim(),
        frequency: form.frequency,
        payDay: form.payDay,
        nextRunDate: form.nextRunDate || null,
        isActive: form.isActive,
      },
      { silent: true }
    );
    setSaving(false);
    if (res.ok) {
      toast.success("Pay schedule created");
      setOpen(false);
      setForm({ ...EMPTY });
      router.refresh();
    } else {
      const fields = res.data?.fields;
      setError(
        fields
          ? Object.values(fields)[0] ?? res.data?.error ?? "Could not save"
          : res.data?.error ?? "Could not save"
      );
    }
  }

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + New schedule
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New pay schedule"
        subtitle="Sets the cadence payroll runs are created on"
      >
        <ScheduleForm form={form} setForm={setForm} error={error} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Creating…" : "Create schedule"}
          </button>
        </div>
      </Modal>
    </>
  );
}

/** Row actions: edit and delete a pay schedule. */
export function ScheduleRowActions({ schedule }: { schedule: Schedule }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: schedule.name,
    frequency: schedule.frequency,
    payDay: schedule.payDay,
    nextRunDate: schedule.nextRunDate ?? "",
    isActive: schedule.isActive,
  });

  async function save() {
    if (form.name.trim().length < 2) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      `/api/org/pay-schedules/${schedule.id}`,
      "PATCH",
      {
        name: form.name.trim(),
        frequency: form.frequency,
        payDay: form.payDay,
        nextRunDate: form.nextRunDate || null,
        isActive: form.isActive,
      },
      { silent: true }
    );
    setSaving(false);
    if (res.ok) {
      toast.success("Pay schedule updated");
      setOpen(false);
      router.refresh();
    } else {
      const fields = res.data?.fields;
      setError(
        fields
          ? Object.values(fields)[0] ?? res.data?.error ?? "Could not save"
          : res.data?.error ?? "Could not save"
      );
    }
  }

  async function remove() {
    setSaving(true);
    const res = await apiCall(`/api/org/pay-schedules/${schedule.id}`, "DELETE");
    setSaving(false);
    if (res.ok) {
      toast.success("Pay schedule deleted");
      setConfirmDelete(false);
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
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-50"
        onClick={() => setConfirmDelete(true)}
      >
        Delete
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit pay schedule"
        subtitle={`${schedule.name} · ${schedule.payRunCount} linked pay run${schedule.payRunCount === 1 ? "" : "s"}`}
      >
        <ScheduleForm form={form} setForm={setForm} error={error} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete pay schedule?"
        subtitle={schedule.name}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Linked pay runs keep their history — the schedule link is simply cleared.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" disabled={saving} onClick={remove}>
              {saving ? "Deleting…" : "Delete schedule"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
