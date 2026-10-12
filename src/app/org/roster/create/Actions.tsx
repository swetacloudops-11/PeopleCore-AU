"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type RosterOption = {
  id: string;
  name: string;
  weekStart: string; // "YYYY-MM-DD"
  range: string;
  status: string;
};
type Option = { id: string; name: string };

const WEEK = [
  { dow: 1, label: "Mon", idx: 0 },
  { dow: 2, label: "Tue", idx: 1 },
  { dow: 3, label: "Wed", idx: 2 },
  { dow: 4, label: "Thu", idx: 3 },
  { dow: 5, label: "Fri", idx: 4 },
  { dow: 6, label: "Sat", idx: 5 },
  { dow: 0, label: "Sun", idx: 6 },
];

/** Calendar-date helpers — dates are plain "YYYY-MM-DD" strings end to end. */
const iso = (d: Date) => d.toISOString().slice(0, 10);

const parseISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
};

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

function hoursBetween(start: string, end: string, breakMinutes: number) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return 0;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return Math.max(0, Math.round(((mins - breakMinutes) / 60) * 100) / 100);
}

export default function ShiftForm({
  rosters,
  employees,
  locations,
  defaultRosterId,
  defaultWeek,
  defaultDate,
}: {
  rosters: RosterOption[];
  employees: Option[];
  locations: Option[];
  defaultRosterId: string;
  defaultWeek: string;
  defaultDate: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdRosterId, setCreatedRosterId] = useState("");
  const [mode, setMode] = useState<"single" | "multiple">("single");

  const [rosterChoice, setRosterChoice] = useState(defaultRosterId || (rosters[0]?.id ?? "__new__"));
  const [newWeek, setNewWeek] = useState(defaultWeek);
  const [newName, setNewName] = useState("");
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [breakMinutes, setBreakMinutes] = useState("30");
  const [locationId, setLocationId] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [isOvertime, setIsOvertime] = useState(false);

  const isNewRoster = rosterChoice === "__new__";
  const chosenRoster = rosters.find((r) => r.id === rosterChoice);
  const weekStart = isNewRoster ? newWeek : (chosenRoster?.weekStart ?? defaultWeek);
  const hours = hoursBetween(startTime, endTime, Number(breakMinutes) || 0);
  const previewDates =
    mode === "single"
      ? [date]
      : weekdays
          .map((dow) => iso(addDays(parseISO(weekStart), WEEK.find((w) => w.dow === dow)!.idx)))
          .sort();

  function toggleWeekday(dow: number) {
    setWeekdays((cur) => (cur.includes(dow) ? cur.filter((d) => d !== dow) : [...cur, dow]));
  }

  async function submit() {
    setError("");
    if (!employeeId) return setError("Choose an employee");
    if (isNewRoster && !newWeek) return setError("Choose the week for the new roster");
    if (mode === "single" && !date) return setError("Choose the shift date");
    if (mode === "multiple" && weekdays.length === 0) return setError("Pick at least one weekday");

    setSaving(true);
    const res = await apiCall<{ ok?: boolean; count?: number; rosterId?: string }>(
      "/api/org/shifts",
      "POST",
      {
        ...(isNewRoster
          ? { weekStart: newWeek, rosterName: newName.trim() || undefined }
          : { rosterId: rosterChoice }),
        employeeId,
        dates: previewDates.filter(Boolean),
        startTime,
        endTime,
        breakMinutes: Number(breakMinutes) || 0,
        locationId: locationId || null,
        roleLabel: roleLabel.trim() || null,
        notes: notes.trim() || null,
        isOvertime,
      }
    );
    setSaving(false);

    if (res.ok) {
      const count = res.data?.count ?? previewDates.length;
      toast.success(`${count} shift${count === 1 ? "" : "s"} created`);
      if (res.data?.rosterId) setCreatedRosterId(res.data.rosterId);
      if (mode === "single") setDate(iso(addDays(parseISO(date), 1)));
      else setWeekdays([]);
      router.refresh();
    } else {
      const fields = (res.data as unknown as { fields?: Record<string, string> })?.fields;
      setError(fields ? Object.values(fields)[0] ?? "Could not create the shift" : "Could not create the shift");
    }
  }

  if (employees.length === 0) {
    return (
      <div className="card p-6 text-sm text-slate-500">
        No active employees are available to roster yet.
      </div>
    );
  }

  return (
    <div className="card p-5">
      {/* Mode switch */}
      <div className="mb-5 flex gap-2">
        {(["single", "multiple"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              mode === m
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {m === "single" ? "Single shift" : "Repeat across weekdays"}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {/* Roster */}
        <div>
          <label className="label" htmlFor="sf-roster">Roster</label>
          <select
            id="sf-roster"
            className="input"
            value={rosterChoice}
            onChange={(e) => setRosterChoice(e.target.value)}
          >
            <option value="__new__">＋ New roster for a week…</option>
            {rosters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.range} ({r.status})
              </option>
            ))}
          </select>
        </div>

        {isNewRoster && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="sf-week">Week starting (Monday)</label>
              <input
                id="sf-week"
                type="date"
                className="input"
                value={newWeek}
                onChange={(e) => setNewWeek(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="sf-name">Roster name</label>
              <input
                id="sf-name"
                className="input"
                placeholder="e.g. Week 42 operations"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Employee */}
        <div>
          <label className="label" htmlFor="sf-emp">Employee</label>
          <select
            id="sf-emp"
            className="input"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        {/* Dates */}
        {mode === "single" ? (
          <div>
            <label className="label" htmlFor="sf-date">Date</label>
            <input
              id="sf-date"
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        ) : (
          <div>
            <span className="label">Weekdays</span>
            <div className="flex flex-wrap gap-2">
              {WEEK.map((w) => {
                const active = weekdays.includes(w.dow);
                return (
                  <button
                    key={w.dow}
                    type="button"
                    onClick={() => toggleWeekday(w.dow)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Week of {weekStart}
              {previewDates.length > 0 && ` · ${previewDates.length} shifts`}
            </p>
          </div>
        )}

        {/* Times */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="sf-start">Start</label>
            <input
              id="sf-start"
              type="time"
              className="input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="sf-end">End</label>
            <input
              id="sf-end"
              type="time"
              className="input"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="sf-break">Break (min)</label>
            <input
              id="sf-break"
              type="number"
              min={0}
              max={240}
              className="input"
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
          <span className="text-slate-500">Paid hours per shift</span>
          <span className="font-semibold tabular-nums text-slate-800">{hours.toFixed(2)}h</span>
        </div>

        {/* Place / role */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="sf-loc">Location</label>
            <select
              id="sf-loc"
              className="input"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">No location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sf-role">Role label</label>
            <input
              id="sf-role"
              className="input"
              placeholder="e.g. Front desk, Forklift…"
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="sf-notes">Notes</label>
          <input
            id="sf-notes"
            className="input"
            placeholder="Optional instructions for the employee…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 accent-amber-500"
            checked={isOvertime}
            onChange={(e) => setIsOvertime(e.target.checked)}
          />
          Flag as overtime
        </label>

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-xs text-slate-400">
            {mode === "single"
              ? "1 shift will be created"
              : `${previewDates.length} shift${previewDates.length === 1 ? "" : "s"} will be created`}
            {createdRosterId && (
              <>
                {" · "}
                <Link href={`/org/roster?roster=${createdRosterId}`} className="text-indigo-600 hover:underline">
                  View roster →
                </Link>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Link href="/org/roster" className="btn-secondary">Cancel</Link>
            <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
              {saving ? "Creating…" : "Create shift"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
