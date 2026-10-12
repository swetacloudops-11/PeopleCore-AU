"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Row = {
  startTime: string;
  endTime: string;
  breakMinutes: string;
  notes: string;
};

/** A standard paid day — hours beyond this count as overtime. */
const STANDARD_DAY_HOURS = 7.6;

const emptyRows = (): Row[] =>
  Array.from({ length: 7 }, () => ({ startTime: "", endTime: "", breakMinutes: "0", notes: "" }));

const mondayOf = (d: Date) => {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};

/** yyyy-mm-dd in the user's local timezone (matches the API's localDate). */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function rowHours(row: Row): number {
  if (!row.startTime || !row.endTime) return 0;
  const span = toMinutes(row.endTime) - toMinutes(row.startTime);
  if (span <= 0) return 0;
  const breakMin = Number.parseInt(row.breakMinutes, 10) || 0;
  return round2(Math.max(0, (span - breakMin) / 60));
}

// Fixed at module load so SSR and hydration agree and renders stay pure.
const DEFAULT_WEEK_START = ymd(mondayOf(new Date()));
const TODAY_KEY = ymd(new Date());

const dayLabel = (d: Date) =>
  d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

export default function TimesheetForm() {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(DEFAULT_WEEK_START);
  const [rows, setRows] = useState<Row[]>(emptyRows);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const days = useMemo(() => {
    const first = parseYmd(weekStart);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const hours = rows.map(rowHours);
  const totalHours = round2(hours.reduce((a, h) => a + h, 0));
  const overtimeHours = round2(
    hours.reduce((a, h) => a + Math.max(0, h - STANDARD_DAY_HOURS), 0)
  );

  function setRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function changeWeek(value: string) {
    if (!value) return;
    const parsed = parseYmd(value);
    if (Number.isNaN(parsed.getTime())) return;
    setWeekStart(ymd(mondayOf(parsed)));
    setRows(emptyRows());
    setErrors({});
  }

  async function save(submit: boolean) {
    if (busy) return;

    // Ignore days where both times are empty (or only one is filled).
    const entries = days
      .map((d, i) => ({ date: ymd(d), row: rows[i], hours: hours[i] }))
      .filter(({ row }) => row.startTime !== "" && row.endTime !== "")
      .map(({ date, row, hours: h }) => ({
        date,
        startTime: row.startTime,
        endTime: row.endTime,
        breakMinutes: Number.parseInt(row.breakMinutes, 10) || 0,
        hours: h,
        notes: row.notes.trim() || undefined,
      }));

    if (entries.length === 0) {
      toast.error("Add start and end times on at least one day");
      return;
    }

    setBusy(true);
    const res = await apiCall<{ ok?: boolean; fields?: Record<string, string> }>(
      "/api/employee/timesheets",
      "POST",
      {
        periodStart: weekStart,
        periodEnd: ymd(days[6]),
        entries,
        submit,
      }
    );
    if (res.ok) {
      toast.success(
        submit ? "Timesheet submitted for approval" : "Draft timesheet saved"
      );
      router.push("/employee/timesheets");
      return;
    }
    setErrors(res.data?.fields ?? {});
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {/* ── Week picker ── */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label" htmlFor="week-start">
              Week starting (Monday)
            </label>
            <input
              id="week-start"
              type="date"
              className="input !w-48"
              value={weekStart}
              onChange={(e) => changeWeek(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="pb-2 text-sm text-slate-500">
            {dayLabel(days[0])} – {dayLabel(days[6])}
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs uppercase tracking-wide text-slate-400">Week total</div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900">
              {totalHours.toFixed(2)}h
            </div>
            {overtimeHours > 0 && (
              <div className="text-xs text-amber-600">
                incl. {overtimeHours.toFixed(2)}h overtime
              </div>
            )}
          </div>
        </div>
        {(errors.periodStart || errors.periodEnd) && (
          <p className="mt-2 text-xs text-rose-600">{errors.periodStart ?? errors.periodEnd}</p>
        )}
      </div>

      {/* ── Day rows ── */}
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Day</th>
              <th className="th">Start</th>
              <th className="th">End</th>
              <th className="th">Break (min)</th>
              <th className="th">Hours</th>
              <th className="th">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {days.map((d, i) => {
              const row = rows[i];
              const h = hours[i];
              const invalid =
                row.startTime !== "" && row.endTime !== "" && h === 0;
              return (
                <tr key={d.toISOString()} className="hover:bg-slate-50/70">
                  <td className="td whitespace-nowrap font-medium text-slate-700">
                    {dayLabel(d)}
                    {ymd(d) === TODAY_KEY && (
                      <span className="ml-2 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                        Today
                      </span>
                    )}
                  </td>
                  <td className="td">
                    <input
                      type="time"
                      className="input !w-28"
                      value={row.startTime}
                      onChange={(e) => setRow(i, { startTime: e.target.value })}
                      disabled={busy}
                    />
                  </td>
                  <td className="td">
                    <input
                      type="time"
                      className="input !w-28"
                      value={row.endTime}
                      onChange={(e) => setRow(i, { endTime: e.target.value })}
                      disabled={busy}
                    />
                  </td>
                  <td className="td">
                    <input
                      type="number"
                      min={0}
                      max={480}
                      step={15}
                      className="input !w-24"
                      value={row.breakMinutes}
                      onChange={(e) => setRow(i, { breakMinutes: e.target.value })}
                      disabled={busy}
                    />
                  </td>
                  <td className={`td tabular-nums ${invalid ? "text-rose-600" : "text-slate-700"}`}>
                    {h > 0 ? `${h.toFixed(2)}h` : "0h"}
                    {invalid && (
                      <div className="text-[10px] text-rose-500">End must be after start</div>
                    )}
                  </td>
                  <td className="td">
                    <input
                      type="text"
                      maxLength={200}
                      className="input !w-56"
                      placeholder="Optional note"
                      value={row.notes}
                      onChange={(e) => setRow(i, { notes: e.target.value })}
                      disabled={busy}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {errors.entries && <p className="text-xs text-rose-600">{errors.entries}</p>}

      {/* ── Actions ── */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-slate-400">
          Hours above {STANDARD_DAY_HOURS}h per day count as overtime. Days without both start and
          end times are ignored.
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => save(false)}
          disabled={busy}
        >
          {busy ? "Saving…" : "Save draft"}
        </button>
        <button type="button" className="btn-primary" onClick={() => save(true)} disabled={busy}>
          {busy ? "Submitting…" : "Save & submit"}
        </button>
      </div>
    </div>
  );
}
