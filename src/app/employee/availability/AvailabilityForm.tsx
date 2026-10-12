"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export type AvailabilityDay = {
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  isAvailable: boolean;
  note: string | null;
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Weekly availability editor (Sunday→Saturday). Saves the whole week to
 * PUT /api/employee/availability as { days: [...] }.
 */
export default function AvailabilityForm({ days: initialDays }: { days: AvailabilityDay[] }) {
  const router = useRouter();
  const [days, setDays] = useState<AvailabilityDay[]>(() =>
    [...initialDays].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  );
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (dayOfWeek: number, patch: Partial<AvailabilityDay>) =>
    setDays((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d))
    );

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();

    // Client-side sanity check before hitting the API.
    for (const d of days) {
      if (d.isAvailable && d.startTime && d.endTime && d.endTime <= d.startTime) {
        setRowError(`${DAY_NAMES[d.dayOfWeek]}: end time must be after start time`);
        return;
      }
    }
    setRowError(null);
    setErrors({});
    setBusy(true);

    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/employee/availability",
      "PUT",
      {
        days: days.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          startTime: d.startTime || null,
          endTime: d.endTime || null,
          isAvailable: d.isAvailable,
          note: d.note?.trim() || null,
        })),
      }
    );
    setBusy(false);

    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success("Availability saved");
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="divide-y divide-slate-100">
        {days.map((d) => (
          <div
            key={d.dayOfWeek}
            className="grid grid-cols-1 items-center gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9.5rem_8.5rem_8.5rem_1fr]"
          >
            <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={d.isAvailable}
                onChange={(e) => update(d.dayOfWeek, { isAvailable: e.target.checked })}
              />
              {DAY_NAMES[d.dayOfWeek]}
            </label>
            <input
              type="time"
              className="input"
              aria-label={`${DAY_NAMES[d.dayOfWeek]} start time`}
              placeholder="Start"
              value={d.startTime ?? ""}
              disabled={!d.isAvailable}
              onChange={(e) => update(d.dayOfWeek, { startTime: e.target.value })}
            />
            <input
              type="time"
              className="input"
              aria-label={`${DAY_NAMES[d.dayOfWeek]} end time`}
              placeholder="End"
              value={d.endTime ?? ""}
              disabled={!d.isAvailable}
              onChange={(e) => update(d.dayOfWeek, { endTime: e.target.value })}
            />
            <input
              className="input"
              placeholder="Note (optional)"
              maxLength={200}
              value={d.note ?? ""}
              onChange={(e) => update(d.dayOfWeek, { note: e.target.value })}
            />
          </div>
        ))}
      </div>

      {rowError && <p className="mt-3 text-xs font-medium text-rose-600">{rowError}</p>}
      {errors.days && <p className="mt-3 text-xs font-medium text-rose-600">{errors.days}</p>}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          Untick a day to mark it as unavailable. Times are 24-hour (HH:MM).
        </p>
        <button type="submit" className="btn-primary shrink-0" disabled={busy}>
          {busy ? "Saving…" : "Save availability"}
        </button>
      </div>
    </form>
  );
}
