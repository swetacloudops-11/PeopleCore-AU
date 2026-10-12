"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Plain serialisable leave type + balance — Decimals converted with Number() server-side. */
export type LeaveTypeOption = {
  id: string;
  name: string;
  unit: string;
  isPaid: boolean;
  colour: string;
  available: number;
};

/** Simple calendar-day span (diff + 1), floored at half a day. */
function suggestDays(start: string, end: string): number | null {
  if (!start || !end) return null;
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
  return Math.max(0.5, days);
}

function F({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-[11px] font-medium text-rose-600">{error}</span>
      )}
    </label>
  );
}

export function LeaveApplyForm({ types }: { types: LeaveTypeOption[] }) {
  const router = useRouter();
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [daysEdited, setDaysEdited] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const selected = types.find((t) => t.id === leaveTypeId) ?? null;
  const unitSuffix = (t: LeaveTypeOption | null) => (t?.unit === "HOURS" ? "h" : "d");

  function pickType(id: string) {
    setLeaveTypeId(id);
    setDaysEdited(false);
    const suggested = suggestDays(startDate, endDate);
    if (suggested !== null) setDays(String(suggested));
  }

  function pickStart(v: string) {
    setStartDate(v);
    if (endDate && !daysEdited) {
      const suggested = suggestDays(v, endDate);
      if (suggested !== null) setDays(String(suggested));
    }
  }

  function pickEnd(v: string) {
    setEndDate(v);
    if (startDate && !daysEdited) {
      const suggested = suggestDays(startDate, v);
      if (suggested !== null) setDays(String(suggested));
    }
  }

  const daysNum = Number(days);
  const hoursNum = Number(hours);
  const overBalance =
    selected !== null && days !== "" && Number.isFinite(daysNum) && daysNum > selected.available;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const next: Record<string, string> = {};
    if (!leaveTypeId) next.leaveTypeId = "Choose a leave type";
    if (!startDate) next.startDate = "Pick a start date";
    if (!endDate) next.endDate = "Pick an end date";
    if (days === "" || !Number.isFinite(daysNum) || daysNum <= 0) {
      next.days = "Enter the number of days (at least 0.5)";
    }
    if (hours !== "" && (!Number.isFinite(hoursNum) || hoursNum < 0 || hoursNum > 244)) {
      next.hours = "Hours must be between 0 and 244";
    }
    if (reason.trim().length < 5) {
      next.reason = "Give a short reason (at least 5 characters)";
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setBusy(true);
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/employee/leave",
      "POST",
      {
        leaveTypeId,
        startDate,
        endDate,
        days: Number(days),
        hours: hours === "" ? undefined : Number(hours),
        reason: reason.trim(),
      }
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success("Leave request submitted");
    router.push("/employee/leave");
  }

  return (
    <form onSubmit={submit} className="card p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <F
            label="Leave type"
            error={errors.leaveTypeId}
            hint={
              selected
                ? `${Number(selected.available).toFixed(1)}${unitSuffix(selected)} available${
                    selected.isPaid ? "" : " · unpaid leave"
                  }`
                : undefined
            }
          >
            <select
              className="input"
              value={leaveTypeId}
              onChange={(e) => pickType(e.target.value)}
            >
              <option value="">— Choose a leave type —</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.available.toFixed(1)}
                  {t.unit === "HOURS" ? "h" : "d"} available
                </option>
              ))}
            </select>
          </F>
        </div>

        <F label="Start date" error={errors.startDate}>
          <input
            type="date"
            className="input"
            value={startDate}
            onChange={(e) => pickStart(e.target.value)}
          />
        </F>

        <F label="End date" error={errors.endDate}>
          <input
            type="date"
            className="input"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => pickEnd(e.target.value)}
          />
        </F>

        <F
          label="Days requested"
          error={errors.days}
          hint="Auto-suggested from your dates — adjust if needed."
        >
          <input
            type="number"
            min={0.5}
            max={365}
            step={0.5}
            className="input"
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setDaysEdited(true);
            }}
          />
        </F>

        <F
          label="Hours (optional)"
          error={errors.hours}
          hint={selected?.unit === "HOURS" ? "This type is tracked in hours" : "Only for part-day leave"}
        >
          <input
            type="number"
            min={0}
            max={244}
            step={0.5}
            className="input"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </F>

        <div className="sm:col-span-2">
          <F label="Reason" error={errors.reason} hint="Shared with your approver.">
            <textarea
              rows={3}
              maxLength={500}
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Family holiday on the south coast"
            />
          </F>
        </div>

        {overBalance && selected && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800 sm:col-span-2">
            ⚠️ You only have {selected.available.toFixed(1)}
            {unitSuffix(selected)} of {selected.name} available, but you are requesting{" "}
            {daysNum.toString()}. Your manager may reduce the request or approve it as unpaid.
          </div>
        )}

        <div className="mt-1 flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secondary" onClick={() => router.push("/employee/leave")}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || types.length === 0}>
            {busy ? "Submitting…" : "Submit leave request"}
          </button>
        </div>
      </div>
    </form>
  );
}
