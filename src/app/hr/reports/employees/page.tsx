import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import {
  ChartPanel,
  Donut,
  BarList,
  ColumnChart,
  StackedBar,
  ProgressBar,
  type DonutSegment,
  type BarItem,
  type ColumnPoint,
  type Tone,
} from "@/components/charts";
import { cx } from "@/lib/format";

const RANGE_CHIPS = [30, 90, 180, 365, 1095] as const;
const RANGE_LABEL: Record<number, string> = {
  30: "30 days",
  90: "90 days",
  180: "6 months",
  365: "12 months",
  1095: "3 years",
};

/** Chart palette — distinct from Badge tones. */
const CHART_TONE: Record<string, Tone> = {
  ACTIVE: "emerald",
  PROBATION: "sky",
  LEAVE: "amber",
  CONTRACT: "violet",
  CASUAL: "teal",
  TERMINATED: "slate",
};

const TYPE_TONE: Record<string, Tone> = {
  FULL_TIME: "sky",
  PART_TIME: "violet",
  CASUAL: "amber",
  CONTRACT: "teal",
};

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const monthsBetween = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));

const startOfRange = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
};

export default async function HrEmployeeReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await hrContext();
  const range = intParam(sp.range, 365, 3650);
  const since = startOfRange(range);
  const now = new Date();

  const [employees, departments, positions, byStatus, byType, byDept] = await Promise.all([
    prisma.employee.findMany({
      where: { organisationId },
      select: {
        id: true,
        hireDate: true,
        terminationDate: true,
        employmentStatus: true,
        employmentType: true,
        departmentId: true,
        positionId: true,
      },
    }),
    prisma.department.findMany({
      where: { organisationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.position.findMany({
      where: { organisationId },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.employee.groupBy({
      by: ["employmentStatus"],
      where: { organisationId },
      _count: { _all: true },
    }),
    prisma.employee.groupBy({
      by: ["employmentType"],
      where: { organisationId },
      _count: { _all: true },
    }),
    prisma.employee.groupBy({
      by: ["departmentId"],
      where: { organisationId },
      _count: { _all: true },
    }),
  ]);

  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const posTitle = new Map(positions.map((p) => [p.id, p.title]));

  const total = employees.length;
  const current = employees.filter((e) => !e.terminationDate);
  const active = current.length;
  const terminated = total - active;

  const hiresInRange = employees.filter((e) => e.hireDate >= since).length;
  const exitsInRange = employees.filter(
    (e) => e.terminationDate !== null && e.terminationDate >= since
  ).length;

  const avgTenureMonths = current.length
    ? Math.round(current.reduce((n, e) => n + monthsBetween(e.hireDate, now), 0) / current.length)
    : 0;

  // ── distribution charts ──
  const statusSegments: DonutSegment[] = byStatus
    .map((s) => ({
      label: pretty(s.employmentStatus),
      value: s._count._all,
      tone: CHART_TONE[s.employmentStatus] ?? "slate",
    }))
    .sort((a, b) => b.value - a.value);

  const typeItems: BarItem[] = byType
    .map((t) => ({
      label: pretty(t.employmentType),
      value: t._count._all,
      tone: TYPE_TONE[t.employmentType] ?? "sky",
    }))
    .sort((a, b) => b.value - a.value);

  const typeSegments: DonutSegment[] = typeItems.map((t) => ({
    label: t.label,
    value: t.value,
    tone: t.tone,
  }));

  const deptItems: BarItem[] = [...byDept]
    .sort((a, b) => b._count._all - a._count._all)
    .map((d) => ({
      label: d.departmentId ? deptName.get(d.departmentId) ?? "Unknown" : "Unassigned",
      value: d._count._all,
      tone: "sky",
    }));

  const posCounts = new Map<string, number>();
  for (const e of employees) {
    const k = e.positionId ?? "none";
    posCounts.set(k, (posCounts.get(k) ?? 0) + 1);
  }
  const posItems: BarItem[] = [...posCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, count]) => ({
      label: id === "none" ? "Unassigned" : posTitle.get(id) ?? "Unknown",
      value: count,
      tone: "violet",
    }));

  const bands = [
    { label: "Under 6m", min: 0, max: 6 },
    { label: "6–12m", min: 6, max: 12 },
    { label: "1–2y", min: 12, max: 24 },
    { label: "2–5y", min: 24, max: 60 },
    { label: "5y+", min: 60, max: Number.MAX_SAFE_INTEGER },
  ].map((b) => ({
    label: b.label,
    count: current.filter((e) => {
      const m = monthsBetween(e.hireDate, now);
      return m >= b.min && m < b.max;
    }).length,
  }));
  const bandItems: BarItem[] = bands.map((b) => ({
    label: b.label,
    value: b.count,
    tone: "indigo",
  }));

  // ── hires / exits trend ──
  const monthCount = Math.min(12, Math.max(3, Math.round(range / 30)));
  const months: { key: string; label: string; hires: number; exits: number }[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
      hires: 0,
      exits: 0,
    });
  }
  const monthIdx = new Map(months.map((m, i) => [m.key, i]));
  const monthKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  for (const e of employees) {
    const hi = monthIdx.get(monthKey(e.hireDate));
    if (hi !== undefined) months[hi].hires += 1;
    if (e.terminationDate) {
      const xi = monthIdx.get(monthKey(e.terminationDate));
      if (xi !== undefined) months[xi].exits += 1;
    }
  }
  const hirePoints: ColumnPoint[] = months.map((m) => ({
    label: m.label,
    value: m.hires,
    tone: "sky",
  }));
  const exitPoints: ColumnPoint[] = months.map((m) => ({
    label: m.label,
    value: m.exits,
    tone: "rose",
  }));

  const fullTime = employees.filter((e) => e.employmentType === "FULL_TIME").length;

  // ── department summary table ──
  const summary = departments
    .map((d) => {
      const members = employees.filter((e) => e.departmentId === d.id);
      const act = members.filter((e) => !e.terminationDate);
      const ft = members.filter((e) => e.employmentType === "FULL_TIME").length;
      return {
        id: d.id,
        name: d.name,
        headcount: members.length,
        active: act.length,
        tenure: act.length
          ? Math.round(act.reduce((n, e) => n + monthsBetween(e.hireDate, now), 0) / act.length)
          : 0,
        fulltime: members.length ? Math.round((ft / members.length) * 100) : 0,
      };
    })
    .sort((a, b) => b.headcount - a.headcount);

  return (
    <div>
      <PageHeader
        title="Employee Reports"
        subtitle={`Headcount, tenure and movement for ${org.name} — read-only aggregates.`}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {RANGE_CHIPS.map((d) => (
            <a
              key={d}
              href={`/hr/reports/employees${qs({ range: d })}`}
              className={cx(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                range === d
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              Last {RANGE_LABEL[d]}
            </a>
          ))}
        </div>
        <span className="text-[11px] text-slate-400">
          New hires and exits are counted within the selected range
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Headcount" value={total} hint={`${departments.length} departments`} tone="sky" />
        <StatCard label="Active" value={active} hint="No termination date" tone="emerald" />
        <StatCard
          label="New hires"
          value={hiresInRange}
          hint={`Last ${RANGE_LABEL[range] ?? `${range} days`}`}
          tone="sky"
        />
        <StatCard
          label="Exits"
          value={exitsInRange}
          hint="Terminations in range"
          tone={exitsInRange ? "rose" : "emerald"}
        />
        <StatCard
          label="Avg tenure"
          value={`${(avgTenureMonths / 12).toFixed(1)} yrs`}
          hint={`${avgTenureMonths} months`}
          tone="indigo"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Employment status" subtitle="All employee records">
          <Donut
            segments={statusSegments}
            size={148}
            thickness={18}
            centerValue={total}
            centerLabel="employees"
          />
        </ChartPanel>

        <ChartPanel title="Employment type mix" subtitle="Full-time, part-time, casual & contract">
          <BarList items={typeItems} />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <StackedBar segments={typeSegments} />
          </div>
        </ChartPanel>

        <ChartPanel title="Headcount by department" subtitle="Where the team sits">
          <BarList items={deptItems} />
        </ChartPanel>

        <ChartPanel title="Tenure bands" subtitle="Current staff by time since hire">
          <BarList items={bandItems} />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <ProgressBar
              value={fullTime}
              max={Math.max(1, total)}
              tone="sky"
              label="Full-time share of headcount"
            />
          </div>
        </ChartPanel>

        <ChartPanel title="New hires by month" subtitle={`Last ${months.length} months`}>
          <ColumnChart points={hirePoints} tone="sky" />
        </ChartPanel>

        <ChartPanel title="Exits by month" subtitle={`Last ${months.length} months`}>
          <ColumnChart points={exitPoints} tone="rose" />
        </ChartPanel>

        <ChartPanel
          className="lg:col-span-2"
          title="Headcount by position"
          subtitle="Top roles across the organisation"
        >
          <BarList items={posItems} />
        </ChartPanel>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Department summary</h2>
          <Badge tone="blue">UNDERLYING ROWS</Badge>
        </div>
        {summary.length === 0 ? (
          <EmptyState title="No departments yet" hint="Create departments to see this breakdown." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Department</th>
                <th className="th">Headcount</th>
                <th className="th">Active</th>
                <th className="th">Avg tenure (months)</th>
                <th className="th">Full-time %</th>
                <th className="th">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">{s.name}</td>
                  <td className="td tabular-nums text-slate-700">{s.headcount}</td>
                  <td className="td">
                    <Badge tone={s.active ? "green" : "slate"}>{s.active}</Badge>
                  </td>
                  <td className="td tabular-nums text-slate-700">{s.tenure}</td>
                  <td className="td tabular-nums text-slate-700">{s.fulltime}%</td>
                  <td className="td">
                    <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{
                          width: `${Math.round(
                            (s.headcount / Math.max(1, total)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          {terminated} historical leaver{terminated === 1 ? "" : "s"} excluded from tenure and
          full-time calculations.
        </p>
      </div>
    </div>
  );
}
