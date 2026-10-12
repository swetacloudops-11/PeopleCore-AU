import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, cx } from "@/lib/format";

export const dynamic = "force-dynamic";

const n = (v: { toString(): string } | null | undefined) =>
  v === null || v === undefined ? 0 : Number(v);

const STATUS_META: Array<{ key: string; label: string; bar: string }> = [
  { key: "SCHEDULED", label: "Scheduled", bar: "bg-indigo-500" },
  { key: "CONFIRMED", label: "Confirmed", bar: "bg-sky-500" },
  { key: "COMPLETED", label: "Completed", bar: "bg-emerald-500" },
  { key: "SWAP_REQUESTED", label: "Swap requested", bar: "bg-amber-500" },
  { key: "SWAPPED", label: "Swapped", bar: "bg-violet-500" },
  { key: "CANCELLED", label: "Cancelled", bar: "bg-rose-400" },
  { key: "MISSED", label: "Missed", bar: "bg-rose-600" },
];

export default async function RosterReportsPage() {
  const { organisationId } = await orgContext();

  const [shifts, departments, conflicts, rosters] = await Promise.all([
    prisma.shift.findMany({
      where: { organisationId },
      select: {
        date: true,
        hours: true,
        isOvertime: true,
        status: true,
        startTime: true,
        endTime: true,
        employee: { select: { departmentId: true, firstName: true, lastName: true } },
        roster: { select: { weekStart: true, name: true } },
      },
    }),
    prisma.department.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.rosterConflict.groupBy({
      by: ["type", "resolved"],
      where: { organisationId },
      _count: { _all: true },
    }),
    prisma.roster.findMany({
      where: { organisationId },
      orderBy: { weekStart: "asc" },
      select: { id: true, name: true, weekStart: true, status: true },
    }),
  ]);

  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  // ── Status counts + coverage ──
  const statusCounts = new Map<string, number>();
  let totalHours = 0;
  let overtimeHours = 0;
  let overtimeShifts = 0;
  for (const s of shifts) {
    statusCounts.set(s.status, (statusCounts.get(s.status) ?? 0) + 1);
    totalHours += n(s.hours);
    if (s.isOvertime) {
      overtimeShifts += 1;
      overtimeHours += n(s.hours);
    }
  }
  const cancelled = statusCounts.get("CANCELLED") ?? 0;
  const missed = statusCounts.get("MISSED") ?? 0;
  const coverage = shifts.length
    ? Math.round(((shifts.length - cancelled) / shifts.length) * 100)
    : 0;
  const maxStatus = Math.max(1, ...STATUS_META.map((s) => statusCounts.get(s.key) ?? 0));

  // ── Hours by department ──
  const byDept = new Map<string, { hours: number; shifts: number }>();
  for (const s of shifts) {
    const key = s.employee.departmentId ?? "none";
    const cur = byDept.get(key) ?? { hours: 0, shifts: 0 };
    cur.hours += n(s.hours);
    cur.shifts += 1;
    byDept.set(key, cur);
  }
  const deptRows = [...byDept.entries()]
    .map(([id, v]) => ({
      id,
      name: id === "none" ? "Unassigned" : deptName.get(id) ?? "Unknown",
      ...v,
      avg: v.shifts ? v.hours / v.shifts : 0,
    }))
    .sort((a, b) => b.hours - a.hours);
  const maxDeptHours = Math.max(1, ...deptRows.map((d) => d.hours));

  // ── Hours by roster week ──
  const byWeek = rosters.map((r) => {
    const rows = shifts.filter((s) => s.roster.weekStart.getTime() === r.weekStart.getTime());
    const hours = rows.reduce((sum, s) => sum + n(s.hours), 0);
    const ot = rows.filter((s) => s.isOvertime).length;
    return { id: r.id, name: r.name, weekStart: r.weekStart, status: r.status, hours, shifts: rows.length, overtime: ot };
  });
  const maxWeekHours = Math.max(1, ...byWeek.map((w) => w.hours));

  // ── Conflicts ──
  const conflictTypes = new Map<string, { total: number; open: number }>();
  let openConflicts = 0;
  for (const c of conflicts) {
    const cur = conflictTypes.get(c.type) ?? { total: 0, open: 0 };
    cur.total += c._count._all;
    if (!c.resolved) {
      cur.open += c._count._all;
      openConflicts += c._count._all;
    }
    conflictTypes.set(c.type, cur);
  }
  const conflictRows = [...conflictTypes.entries()].sort((a, b) => b[1].total - a[1].total);
  const maxConflicts = Math.max(1, ...conflictRows.map(([, v]) => v.total));

  return (
    <div>
      <PageHeader
        title="Roster Reports"
        subtitle="Scheduled hours, shift coverage and roster conflicts — read-only."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Shifts" value={shifts.length} hint={`${rosters.length} rosters`} tone="indigo" />
        <StatCard label="Scheduled hours" value={totalHours.toFixed(1)} hint="Across all shifts" tone="sky" />
        <StatCard label="Overtime shifts" value={overtimeShifts} hint={`${overtimeHours.toFixed(1)} h`} tone={overtimeShifts ? "amber" : "emerald"} />
        <StatCard
          label="Coverage"
          value={`${coverage}%`}
          hint={`${cancelled} cancelled · ${missed} missed`}
          tone={coverage >= 95 ? "emerald" : coverage >= 85 ? "amber" : "rose"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Shift status ── */}
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Shift coverage by status</h2>
          {shifts.length === 0 ? (
            <EmptyState title="No shifts scheduled" hint="Create a roster to see coverage." />
          ) : (
            STATUS_META.map((s) => {
              const count = statusCounts.get(s.key) ?? 0;
              return (
                <div key={s.key} className="flex items-center gap-3 py-1.5">
                  <span className="w-32 shrink-0 text-xs text-slate-600">{s.label}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className={`h-full rounded ${s.bar}`}
                      style={{ width: `${Math.round((count / maxStatus) * 100)}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500">
                    {count}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* ── Conflicts ── */}
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Conflicts by type</h2>
            <Badge tone={openConflicts ? "red" : "green"}>{openConflicts} OPEN</Badge>
          </div>
          {conflictRows.length === 0 ? (
            <EmptyState title="No roster conflicts" hint="Nothing to resolve — nice." />
          ) : (
            conflictRows.map(([type, v]) => (
              <div key={type} className="flex items-center gap-3 py-1.5">
                <span className="w-36 shrink-0 text-xs text-slate-600">
                  {type.replace("_", " ").toLowerCase()}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className={`h-full rounded ${v.open ? "bg-rose-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.round((v.total / maxConflicts) * 100)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-500">
                  {v.total} <span className="text-slate-400">({v.open} open)</span>
                </span>
              </div>
            ))
          )}
        </div>

        {/* ── Hours by department ── */}
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            Scheduled hours by department
          </h2>
          {deptRows.length === 0 ? (
            <EmptyState title="No department hours" />
          ) : (
            deptRows.map((d) => (
              <div key={d.id} className="flex items-center gap-3 py-1.5">
                <span className="w-36 shrink-0 truncate text-xs text-slate-600">{d.name}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded bg-indigo-500"
                    style={{ width: `${Math.round((d.hours / maxDeptHours) * 100)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-500">
                  {d.hours.toFixed(1)} h <span className="text-slate-400">({d.shifts})</span>
                </span>
              </div>
            ))
          )}
        </div>

        {/* ── Hours by week ── */}
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            Scheduled hours by roster week
          </h2>
          {byWeek.length === 0 ? (
            <EmptyState title="No rosters yet" />
          ) : (
            <div className="flex h-44 items-end gap-2">
              {byWeek.map((w) => (
                <div key={w.id} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[9px] tabular-nums text-slate-400">
                    {w.hours.toFixed(0)}
                  </span>
                  <div
                    className="w-full rounded-t bg-emerald-500"
                    style={{ height: `${(w.hours / maxWeekHours) * 100}%` }}
                    title={`${w.name}: ${w.hours.toFixed(1)} h`}
                  />
                  <span className="text-[9px] text-slate-400">{formatDate(w.weekStart)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Roster table ── */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Roster summary</h2>
        {byWeek.length === 0 ? (
          <EmptyState title="No rosters yet" hint="Publish a roster to populate this report." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Roster</th>
                <th className="th">Week</th>
                <th className="th">Status</th>
                <th className="th">Shifts</th>
                <th className="th">Hours</th>
                <th className="th">Overtime shifts</th>
                <th className="th">Load</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byWeek.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">{w.name}</td>
                  <td className="td whitespace-nowrap text-slate-600">
                    {formatDate(w.weekStart)}
                  </td>
                  <td className="td">
                    <Badge tone={w.status === "PUBLISHED" ? "green" : w.status === "DRAFT" ? "slate" : "blue"}>
                      {w.status}
                    </Badge>
                  </td>
                  <td className="td tabular-nums text-slate-700">{w.shifts}</td>
                  <td className="td tabular-nums text-slate-700">{w.hours.toFixed(1)} h</td>
                  <td className="td tabular-nums text-slate-700">{w.overtime}</td>
                  <td className="td">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cx(
                          "h-full rounded-full",
                          w.hours >= maxWeekHours * 0.75 ? "bg-rose-500" : "bg-indigo-500"
                        )}
                        style={{ width: `${Math.round((w.hours / maxWeekHours) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
