import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, strParam } from "@/lib/org";
import { Badge, StatCard, EmptyState } from "@/components/ui";
import { ChartPanel, ColumnChart, BarList } from "@/components/charts";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type ShiftRow = Prisma.ShiftGetPayload<{
  include: {
    employee: { select: { firstName: true; lastName: true; employeeNumber: true } };
    location: { select: { name: true } };
  };
}>;

/** Today ± n days as a calendar date (UTC midnight — how Prisma stores @db.Date). */
const D = (days: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + days));
};

/** Whole-day arithmetic that stays on the calendar regardless of timezone. */
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

const mondayOf = (d: Date) => {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = new Date(t).getUTCDay();
  return new Date(t - ((dow + 6) % 7) * 86400000);
};

/**
 * `?week=` values are written back from `roster.weekStart` (a calendar date
 * stored as UTC midnight), so parse them as UTC to round-trip cleanly.
 * The no-param default is the same shape: this week's Monday.
 */
const pd = (value: string | undefined, fallback?: Date) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : (fallback ?? new Date());
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ROSTER_TONE: Record<string, string> = {
  DRAFT: "amber",
  PUBLISHED: "green",
  LOCKED: "blue",
  ARCHIVED: "slate",
};

const SHIFT_TONE: Record<string, string> = {
  SCHEDULED: "blue",
  CONFIRMED: "green",
  SWAP_REQUESTED: "amber",
  SWAPPED: "purple",
  CANCELLED: "slate",
  COMPLETED: "green",
  MISSED: "red",
};

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; roster?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const rosterId = strParam(sp.roster);
  const week = pd(sp.week, pd(iso(mondayOf(D(0)))));

  const rosters = await prisma.roster.findMany({
    where: { organisationId },
    orderBy: { weekStart: "desc" },
    take: 10,
    include: { _count: { select: { shifts: true, conflicts: true } } },
  });

  // Prefer the explicit ?roster=, else the roster covering ?week=, else the newest.
  let selected: (typeof rosters)[number] | null = rosterId
    ? (rosters.find((r) => r.id === rosterId) ?? null)
    : null;
  if (!selected && rosterId) {
    selected = await prisma.roster.findFirst({
      where: { id: rosterId, organisationId },
      include: { _count: { select: { shifts: true, conflicts: true } } },
    });
  }
  if (!selected) {
    const covering = rosters.find((r) => week >= r.weekStart && week <= r.weekEnd);
    if (covering) {
      selected = covering;
    } else if (!sp.week) {
      // No explicit week in the URL → show the newest roster.
      selected = rosters[0] ?? null;
    }
    // An explicit ?week= with nothing covering it → empty state below.
  }

  const [shiftList, openConflicts, conflictTotal] = await Promise.all([
    selected
      ? prisma.shift.findMany({
          where: { organisationId, rosterId: selected.id },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          include: {
            employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
            location: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    selected
      ? prisma.rosterConflict.count({
          where: { organisationId, rosterId: selected.id, resolved: false },
        })
      : Promise.resolve(0),
    prisma.rosterConflict.count({ where: { organisationId, resolved: false } }),
  ]);
  const shifts: ShiftRow[] = shiftList;

  const totalHours = shifts.reduce((sum, s) => sum + Number(s.hours), 0);
  const employees = new Set(shifts.map((s) => s.employeeId)).size;
  const overtimeShifts = shifts.filter((s) => s.isOvertime).length;

  // Hours scheduled per day of the selected roster week.
  const hoursByDay = (() => {
    const map = new Map<string, { label: string; value: number }>();
    for (const s of shifts) {
      const d = new Date(s.date);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-AU", { weekday: "short" });
      const cur = map.get(key) ?? { label, value: 0 };
      cur.value += Number(s.hours);
      map.set(key, cur);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => ({ label: v.label, value: Math.round(v.value * 10) / 10 }));
  })();

  // Heaviest rostered employees this week.
  const topRostered = (() => {
    const map = new Map<string, { name: string; hours: number }>();
    for (const s of shifts) {
      const cur = map.get(s.employeeId) ?? {
        name: `${s.employee.firstName} ${s.employee.lastName}`,
        hours: 0,
      };
      cur.hours += Number(s.hours);
      map.set(s.employeeId, cur);
    }
    return [...map.values()]
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8)
      .map((v) => ({ label: v.name, value: Math.round(v.hours * 10) / 10 }));
  })();

  // Day-grouped view of the selected roster (Mon → Sun of its week).
  const startOfView = selected ? new Date(selected.weekStart) : week;
  const groups = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startOfView, i);
    return { date, label: DAY_NAMES[date.getUTCDay()], items: [] as ShiftRow[] };
  });
  const extras: ShiftRow[] = [];
  for (const s of shifts) {
    const key = iso(s.date);
    const group = groups.find((g) => iso(g.date) === key);
    if (group) group.items.push(s);
    else extras.push(s);
  }

  const navQuery = (target: Date) => qs({ week: iso(target) });
  // The visible week always tracks the selected roster so the label, the
  // picker cards and the prev/next links stay in the same date convention.
  const viewWeek = selected ? new Date(selected.weekStart) : week;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Roster calendar
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · weekly rosters, shifts and coverage
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/org/roster/create" className="btn-primary">+ Create shifts</Link>
          <Link href="/org/roster/publish" className="btn-secondary">Publish</Link>
        </div>
      </div>

      {/* ── Week selector ── */}
      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Link href={navQuery(addDays(viewWeek, -7))} className="btn-secondary !py-1.5 text-xs">← Previous week</Link>
          <Link href={navQuery(mondayOf(D(0)))} className="btn-secondary !py-1.5 text-xs">This week</Link>
          <Link href={navQuery(addDays(viewWeek, 7))} className="btn-secondary !py-1.5 text-xs">Next week →</Link>
        </div>
        <div className="text-sm font-medium text-slate-700">
          Week of {formatDate(viewWeek)} → {formatDate(addDays(viewWeek, 6))}
        </div>
        <Link href={qs({ week: iso(viewWeek), roster: undefined })} className="text-xs text-indigo-600 hover:underline">
          Clear selection
        </Link>
      </div>

      {/* ── Roster picker ── */}
      {rosters.length === 0 ? (
        <EmptyState
          title="No rosters yet"
          hint="Create your first roster week by adding shifts."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rosters.map((r) => {
            const active = selected?.id === r.id;
            return (
              <Link
                key={r.id}
                href={qs({ week: iso(new Date(r.weekStart)), roster: r.id })}
                className={`card p-4 transition hover:shadow-md ${
                  active ? "border-indigo-400 ring-2 ring-indigo-100" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">{r.name}</span>
                  <Badge tone={ROSTER_TONE[r.status] ?? "slate"}>{r.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDate(r.weekStart)} → {formatDate(r.weekEnd)}
                </p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                  <span>{r._count.shifts} shifts</span>
                  <span className={r._count.conflicts ? "text-rose-500" : ""}>
                    {r._count.conflicts} conflicts
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Selected roster ── */}
      {selected ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Scheduled hours" value={`${totalHours.toFixed(1)}h`} hint={`${shifts.length} shifts`} tone="indigo" />
            <StatCard label="Shifts" value={shifts.length} hint={`${employees} employees rostered`} tone="sky" />
            <StatCard label="Overtime shifts" value={overtimeShifts} hint="Flagged for review" tone={overtimeShifts ? "amber" : "emerald"} />
            <StatCard label="Open conflicts" value={openConflicts} hint={`${conflictTotal} across all rosters`} tone={openConflicts ? "rose" : "emerald"} />
          </div>

          {/* ── Roster shape ── */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ChartPanel title="Scheduled hours by day" subtitle={`${selected.name} · this week`}>
              <ColumnChart
                points={hoursByDay}
                tone="indigo"
                height={132}
                valueFormat={(v) => `${v}h`}
              />
            </ChartPanel>

            <ChartPanel
              title="Shift load"
              subtitle="Distribution of rostered hours across the team"
            >
              <BarList
                items={topRostered}
                tone="sky"
                valueFormat={(v) => `${v}h`}
                showPercents={false}
              />
            </ChartPanel>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-slate-800">{selected.name}</span>
              <Badge tone={ROSTER_TONE[selected.status] ?? "slate"}>{selected.status}</Badge>
              <span className="text-xs text-slate-500">
                {formatDate(selected.weekStart)} → {formatDate(selected.weekEnd)}
                {selected.publishedAt ? ` · published ${formatDate(selected.publishedAt)}` : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/org/roster/create?roster=${selected.id}`} className="btn-secondary !py-1.5 text-xs">
                + Add shift
              </Link>
              <Link href={`/org/roster/conflicts?roster=${selected.id}`} className="btn-secondary !py-1.5 text-xs">
                Conflicts ({openConflicts})
              </Link>
              <Link href={`/org/roster/publish?roster=${selected.id}`} className="btn-primary !py-1.5 text-xs">
                {selected.status === "DRAFT" ? "Publish roster" : "Manage publishing"}
              </Link>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {groups.map((g) => (
              <section key={iso(g.date)} className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <h2 className="text-sm font-semibold text-slate-800">
                    {g.label} <span className="font-normal text-slate-500">{formatDate(g.date)}</span>
                  </h2>
                  <span className="text-xs text-slate-500">
                    {g.items.length} shift{g.items.length === 1 ? "" : "s"} ·{" "}
                    {g.items.reduce((sum, s) => sum + Number(s.hours), 0).toFixed(1)}h
                  </span>
                </div>
                {g.items.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-slate-400">No shifts scheduled</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead>
                        <tr>
                          <th className="th">Employee</th>
                          <th className="th">Time</th>
                          <th className="th">Hours</th>
                          <th className="th">Location</th>
                          <th className="th">Role</th>
                          <th className="th">Status</th>
                          <th className="th">Flags</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {g.items.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50/70">
                            <td className="td font-medium text-slate-800">
                              {s.employee.firstName} {s.employee.lastName}
                              <span className="ml-1.5 text-[11px] text-slate-400">
                                {s.employee.employeeNumber}
                              </span>
                            </td>
                            <td className="td tabular-nums">
                              {s.startTime} – {s.endTime}
                              <span className="ml-1 text-[11px] text-slate-400">
                                break {s.breakMinutes}m
                              </span>
                            </td>
                            <td className="td font-medium tabular-nums">
                              {Number(s.hours).toFixed(2)}h
                            </td>
                            <td className="td text-slate-500">{s.location?.name ?? "—"}</td>
                            <td className="td text-slate-500">{s.roleLabel ?? "—"}</td>
                            <td className="td">
                              <Badge tone={SHIFT_TONE[s.status] ?? "slate"}>{s.status.replace("_", " ")}</Badge>
                            </td>
                            <td className="td">
                              <div className="flex gap-1.5">
                                {s.isOvertime && <Badge tone="amber">OT</Badge>}
                                {s.publishedAt && <Badge tone="green">LIVE</Badge>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}

            {extras.length > 0 && (
              <section className="card overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <h2 className="text-sm font-semibold text-slate-800">
                    Outside this week
                    <span className="ml-2 font-normal text-slate-500">{extras.length} shifts</span>
                  </h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {extras.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className="text-slate-700">
                        {formatDate(s.date)} · {s.employee.firstName} {s.employee.lastName} ·{" "}
                        <span className="tabular-nums">{s.startTime}–{s.endTime}</span>
                      </span>
                      <Badge tone={SHIFT_TONE[s.status] ?? "slate"}>{s.status.replace("_", " ")}</Badge>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </>
      ) : rosters.length > 0 ? (
        <div className="mt-6">
          <EmptyState
            title={`No roster for the week of ${formatDate(week)}`}
            hint="Step through the weeks above, or create shifts to start a roster for this week."
          />
        </div>
      ) : null}
    </div>
  );
}
