import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext, qs } from "@/lib/employee";
import { Badge, EmptyState, StatCard } from "@/components/ui";
import { ChartPanel, ColumnChart } from "@/components/charts";
import { formatDate } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const addDays = (d: Date, days: number) => {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
};

/** Local-midnight Date from a yyyy-mm-dd string (null when invalid). */
const parseDay = (value: string | undefined): Date | null => {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

/** Monday of the week containing `d`. */
const mondayOf = (d: Date): Date => addDays(d, -((d.getDay() + 6) % 7));

/** yyyy-mm-dd in local calendar terms — used for ?week= links. */
const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Calendar-day key for a @db.Date value — Prisma stores and returns these at
 * midnight, so the ISO prefix groups shifts into the same buckets the week
 * query uses, independent of the server timezone.
 */
const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

/** Badge tone per ShiftStatus (Badge palette only). */
const SHIFT_TONE: Record<string, string> = {
  SCHEDULED: "blue",
  CONFIRMED: "green",
  SWAP_REQUESTED: "purple",
  SWAPPED: "purple",
  CANCELLED: "red",
  COMPLETED: "slate",
  MISSED: "amber",
};

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const { employee, organisationId, org } = await employeeContext();

  const requested = parseDay(sp.week);
  const weekStart = mondayOf(requested ?? D(0));
  const weekEnd = addDays(weekStart, 6);
  const todayKey = dayKey(D(0));

  const shifts = await prisma.shift.findMany({
    where: {
      employeeId: employee.id,
      organisationId,
      date: { gte: weekStart, lte: weekEnd },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: {
      location: { select: { name: true } },
      roster: { select: { name: true } },
    },
  });

  // Group the week's shifts into Mon–Sun buckets keyed the same way Prisma
  // stored the @db.Date values.
  type ShiftRow = (typeof shifts)[number];
  const byDay = new Map<string, ShiftRow[]>();
  for (const s of shifts) {
    const key = dayKey(s.date);
    const list = byDay.get(key);
    if (list) list.push(s);
    else byDay.set(key, [s]);
  }
  const days: Array<{ key: string; date: Date; shifts: ShiftRow[] }> = Array.from(
    { length: 7 },
    (_, i) => {
      const key = dayKey(addDays(weekStart, i));
      return {
        key,
        date: new Date(`${key}T00:00:00Z`),
        shifts: byDay.get(key) ?? [],
      };
    }
  );

  const totalHours =
    Math.round(shifts.reduce((a, s) => a + Number(s.hours), 0) * 10) / 10;
  const overtimeHours =
    Math.round(
      shifts.filter((s) => s.isOvertime).reduce((a, s) => a + Number(s.hours), 0) * 10
    ) / 10;

  const hourPoints = days.map((d) => ({
    label: d.date.toLocaleDateString("en-AU", { weekday: "short" }),
    value: Math.round(d.shifts.reduce((a, s) => a + Number(s.hours), 0) * 10) / 10,
  }));

  const daysWithShifts = days.filter((d) => d.shifts.length > 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {org.name} · {employee.firstName} {employee.lastName}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            My Schedule
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Week of {formatDate(weekStart)} – {formatDate(weekEnd)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/employee/roster/upcoming" className="btn-secondary">
            Upcoming shifts
          </Link>
          <Link href="/employee/roster/swaps" className="btn-primary">
            Request a swap
          </Link>
        </div>
      </div>

      {/* ── Week navigator ── */}
      <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link
          href={`/employee/roster${qs({ week: isoDay(addDays(weekStart, -7)) })}`}
          className="btn-secondary !py-1.5 text-xs"
        >
          ← Previous week
        </Link>
        <p className="text-sm font-medium text-slate-700">
          {formatDate(weekStart)} – {formatDate(weekEnd)}
          <span className="ml-2 text-xs font-normal text-slate-400">Mon – Sun</span>
        </p>
        <div className="flex gap-2">
          <Link href="/employee/roster" className="btn-secondary !py-1.5 text-xs">
            This week
          </Link>
          <Link
            href={`/employee/roster${qs({ week: isoDay(addDays(weekStart, 7)) })}`}
            className="btn-secondary !py-1.5 text-xs"
          >
            Next week →
          </Link>
        </div>
      </div>

      {/* ── Week stats ── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Shifts this week"
          value={shifts.length}
          hint="As published in the roster"
          tone="indigo"
        />
        <StatCard
          label="Hours this week"
          value={totalHours.toFixed(1)}
          hint="Rostered hours (after breaks)"
          tone="emerald"
        />
        <StatCard
          label="Overtime hours"
          value={overtimeHours.toFixed(1)}
          hint={overtimeHours > 0 ? "Flagged shifts included" : "No overtime this week"}
          tone="amber"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* ── Hours per day ── */}
        <ChartPanel title="Hours per day" subtitle="Rostered hours · Mon–Sun">
          <ColumnChart
            points={hourPoints}
            tone="violet"
            height={150}
            valueFormat={(v) => `${v}h`}
          />
        </ChartPanel>

        {/* ── Days with shifts ── */}
        <div className="space-y-3 lg:col-span-2">
          {daysWithShifts.length === 0 ? (
            <EmptyState
              title="No shifts this week"
              hint="Use the arrows above to browse other weeks, or check your upcoming shifts."
            />
          ) : (
            daysWithShifts.map((d) => (
              <div key={d.key} className="card p-4">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">
                      {d.date.toLocaleDateString("en-AU", { weekday: "long" })}
                      {d.key === todayKey && (
                        <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                          Today
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400">{formatDate(d.date)}</p>
                  </div>
                  <span className="text-xs font-medium tabular-nums text-slate-500">
                    {d.shifts.reduce((a, s) => a + Number(s.hours), 0).toFixed(1)}h ·{" "}
                    {d.shifts.length} {d.shifts.length === 1 ? "shift" : "shifts"}
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {d.shifts.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-2 last:pb-0"
                    >
                      <Link
                        href={`/employee/shifts/${s.id}`}
                        className="min-w-32 text-sm font-medium tabular-nums text-slate-800 hover:text-violet-600 hover:underline"
                      >
                        {s.startTime}–{s.endTime}
                      </Link>
                      <span className="text-xs text-slate-500">
                        {s.breakMinutes > 0 ? `${s.breakMinutes}m break` : "No break"}
                      </span>
                      <span className="text-xs font-medium tabular-nums text-slate-600">
                        {Number(s.hours).toFixed(1)}h
                      </span>
                      <span className="text-xs text-slate-600">
                        {s.location?.name ?? "Location TBA"}
                      </span>
                      <span className="hidden text-[11px] text-slate-400 sm:inline">
                        {s.roster.name}
                      </span>
                      {s.roleLabel && (
                        <span className="text-xs text-slate-400">{s.roleLabel}</span>
                      )}
                      {s.isOvertime && <Badge tone="amber">Overtime</Badge>}
                      <span className="ml-auto">
                        <Badge tone={SHIFT_TONE[s.status] ?? "slate"}>
                          {s.status.replace(/_/g, " ")}
                        </Badge>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
