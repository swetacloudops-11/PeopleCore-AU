"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export type ScheduleFormValues = {
  name: string;
  frequency: string;
  payDay: number;
  nextRunDate: string;
  isActive: boolean;
};

const FREQUENCIES = ["WEEKLY", "FORTNIGHTLY", "MONTHLY"] as const;

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const EMPTY: ScheduleFormValues = {
  name: "",
  frequency: "FORTNIGHTLY",
  payDay: 4,
  nextRunDate: "",
  isActive: true,
};

/**
 * Create/edit form for a pay schedule. Used by the create page (no `id`) and
 * by the row actions modal (with `id`). Posts to /api/payroll/schedules.
 */
export default function ScheduleForm({
  id,
  initial,
  onDone,
}: {
  id?: string;
  initial?: Partial<ScheduleFormValues>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ScheduleFormValues>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.name.trim().length < 3) {
      setError("Name must be at least 3 characters");
      return;
    }
    setSaving(true);
    setError("");
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      id ? `/api/payroll/schedules/${id}` : "/api/payroll/schedules",
      id ? "PATCH" : "POST",
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
      toast.success(id ? "Pay schedule updated" : "Pay schedule created");
      if (id) {
        router.refresh();
        onDone?.();
      } else {
        onDone?.();
        router.push("/payroll/schedules");
      }
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
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="ps-name">
          Schedule name
        </label>
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
          <label className="label" htmlFor="ps-freq">
            Frequency
          </label>
          <select
            id="ps-freq"
            className="input"
            value={form.frequency}
            onChange={(e) => setForm({ ...form, frequency: e.target.value })}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f.charAt(0) + f.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ps-day">
            Pay day
          </label>
          <select
            id="ps-day"
            className="input"
            value={form.payDay}
            onChange={(e) => setForm({ ...form, payDay: Number(e.target.value) })}
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="ps-next">
          Next run date <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="ps-next"
          type="date"
          className="input"
          value={form.nextRunDate}
          onChange={(e) => setForm({ ...form, nextRunDate: e.target.value })}
        />
        <p className="mt-1 text-[11px] text-slate-400">
          Leave blank to derive the next run from the pay day.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
        />
        Active &mdash; include this schedule when creating pay runs
      </label>

      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : id ? "Save changes" : "Create schedule"}
        </button>
      </div>
    </form>
  );
}
