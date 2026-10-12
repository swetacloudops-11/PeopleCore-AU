import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import AvailabilityForm, { type AvailabilityDay } from "./AvailabilityForm";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default async function AvailabilityPage() {
  const { employee, org } = await employeeContext();

  const rows = await prisma.availability.findMany({
    where: { employeeId: employee.id },
  });
  const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));

  // Plain serialisable week (Sun→Sat) with nulls for unset days.
  const days: AvailabilityDay[] = Array.from({ length: 7 }, (_, dayOfWeek) => {
    const row = byDay.get(dayOfWeek);
    return {
      dayOfWeek,
      startTime: row?.startTime ?? null,
      endTime: row?.endTime ?? null,
      isAvailable: row?.isAvailable ?? false,
      note: row?.note ?? null,
    };
  });

  const availableDays = days.filter((d) => d.isAvailable);

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-slate-500">
          {org.name} · {employee.firstName} {employee.lastName}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          My Availability
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tell your manager when you can usually work each week
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 sm:p-5 lg:col-span-2">
          <AvailabilityForm days={days} />
        </div>

        {/* ── Current pattern summary ── */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-800">Your weekly pattern</h3>
          {availableDays.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No availability set yet — tick the days you can work and add your hours.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {availableDays.map((d) => (
                <li key={d.dayOfWeek} className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-slate-700">
                    {DAY_NAMES[d.dayOfWeek]}
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {d.startTime && d.endTime
                      ? `${d.startTime}–${d.endTime}`
                      : d.startTime || d.endTime || "Any time"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {availableDays.some((d) => d.note) && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Notes
              </h4>
              <ul className="mt-1.5 space-y-1 text-xs text-slate-500">
                {availableDays
                  .filter((d) => d.note)
                  .map((d) => (
                    <li key={d.dayOfWeek}>
                      <span className="font-medium text-slate-600">
                        {DAY_NAMES[d.dayOfWeek]}:
                      </span>{" "}
                      {d.note}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
            Managers use this pattern when building the roster — it is a preference, not
            a guarantee of shifts.
          </p>
        </div>
      </div>
    </div>
  );
}
