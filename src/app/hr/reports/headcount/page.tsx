import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam } from "@/lib/hr";
import { StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import {
  ChartPanel,
  Donut,
  BarList,
  ColumnChart,
  StackedBar,
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

export default async function HrHeadcountReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();
  const range = intParam(sp.range, 365, 3650);
  const now = new Date();

  const [
    employees,
    departments,
    locations,
    positions,
    byStatus,
    byType,
    byDept,
    byLocation,
  ] = await Promise.all([
    prisma.employee.findMany({
      where: { organisationId },
      select: {
        id: true,
        hireDate: true,
        terminationDate: true,
        employmentStatus: true,
        employmentType: true,
        departmentId: true,
        locationId: true,
        positionId: true,
      },
    }),
    prisma.department.findMany({
      where: { organisationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
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
    prisma.employee.groupBy({
      by: ["locationId"],
      where: { organisationId },
      _count: { _all: true },
    }),
  ]);

  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const locName = new Map(locations.map((l) => [l.id, l.name]));

  const total = employees.length;
  const active = employees.filter(
    (e) => e.terminationDate === null && e.employmentStatus !== "TERMINATED"
  ).length;
  const departmentsUsed = new Set(employees.map((e) => e.departmentId).filter(Boolean)).size;
  const avgPerDept = departments.length ? Math.round((total / departments.length) * 10) / 10 : 0;

  // ── distribution charts ──
  const statusSegments: DonutSegment[] = byStatus
    .map((s) => ({
      label: pretty(s.employmentStatus),
      value: s._count._all,
      tone: CHART_TONE[s.employmentStatus] ?? "slate",
    }))
    .sort((a, b) => b.value - a.value);

  const typeSegments: DonutSegment[] = byType
    .map((t) => ({
      label: pretty(t.employmentType),
      value: t._count._all,
      tone: TYPE_TONE[t.employmentType] ?? "sky",
    }))
    .sort((a, b) => b.value - a.value);

  const deptItems: BarItem[] = [...byDept]
    .sort((a, b) => b._count._all - a._count._all)
    .map((d) => ({
      label: d.departmentId ? deptName.get(d.departmentId) ?? "Unknown" : "Unassigned",
      value: d._count._all,
      tone: "sky",
    }));

  const locItems: BarItem[] = [...byLocation]
    .sort((a, b) => b._count._all - a._count._all)
    .map((l) => ({
      label: l.locationId ? locName.get(l.locationId) ?? "Unknown" : "Unassigned",
      value: l._count._all,
      tone: "emerald",
    }));

  const posItems: BarItem[] = positions
    .map(
      (p): BarItem => ({
        label: p.title,
        value: employees.filter((e) => e.positionId === p.id).length,
        tone: "violet",
      })
    )
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // ── headcount trend (net headcount at each month end) ──
  const monthCount = Math.min(12, Math.max(3, Math.round(range / 30)));
  const months: { key: string; label: string; end: Date }[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
      end: i === 0 ? now : new Date(d.getFullYear(), d.getMonth() + 1, 0),
    });
  }
  const trendPoints: ColumnPoint[] = months.map((m) => ({
    label: m.label,
    value: employees.filter(
      (e) =>
        e.hireDate <= m.end && (e.terminationDate === null || e.terminationDate > m.end)
    ).length,
    tone: "sky",
  }));

  const growth = total > 0 ? total - (employees.filter((e) => e.hireDate < months[0].end).length) : 0;

  // ── department × employment-type matrix ──
  const matrix = departments
    .map((d) => {
      const members = employees.filter((e) => e.departmentId === d.id);
      const count = (t: string) => members.filter((e) => e.employmentType === t).length;
      return {
        id: d.id,
        name: d.name,
        total: members.length,
        fullTime: count("FULL_TIME"),
        partTime: count("PART_TIME"),
        casual: count("CASUAL"),
        contract: count("CONTRACT"),
      };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div>
      <PageHeader
        title="Headcount Reports"
        subtitle="Workforce distribution by department, location, employment type and status."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {RANGE_CHIPS.map((d) => (
            <a
              key={d}
              href={`/hr/reports/headcount${qs({ range: d })}`}
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
          Range controls the headcount trend window
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Total headcount" value={total} hint="All employee records" tone="sky" />
        <StatCard label="Active" value={active} hint="Current workforce" tone="emerald" />
        <StatCard label="Departments" value={departments.length} hint={`${departmentsUsed} with staff`} tone="indigo" />
        <StatCard label="Locations" value={locations.length} hint="Physical & remote" tone="amber" />
        <StatCard label="Avg per department" value={avgPerDept} hint="Employees / department" tone="sky" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Headcount by status" subtitle="All employee records">
          <Donut
            segments={statusSegments}
            size={148}
            thickness={18}
            centerValue={total}
            centerLabel="employees"
          />
        </ChartPanel>

        <ChartPanel title="Headcount by type" subtitle="Contract mix">
          <Donut
            segments={typeSegments}
            size={148}
            thickness={18}
            centerValue={total}
            centerLabel="employees"
          />
        </ChartPanel>

        <ChartPanel title="By department" subtitle="Ranked by headcount">
          <BarList items={deptItems} />
        </ChartPanel>

        <ChartPanel title="By location" subtitle="Ranked by headcount">
          <BarList items={locItems} />
        </ChartPanel>

        <ChartPanel
          className="lg:col-span-2"
          title="Headcount trend"
          subtitle={`Net headcount at each month end · last ${months.length} months`}
          action={
            <span className="text-[11px] text-slate-400">
              {growth >= 0 ? "+" : ""}
              {growth} in range
            </span>
          }
        >
          <ColumnChart points={trendPoints} tone="sky" height={160} />
        </ChartPanel>

        <ChartPanel title="Workforce composition" subtitle="Stacked by employment type">
          <StackedBar segments={typeSegments} height={16} />
        </ChartPanel>

        <ChartPanel title="By position" subtitle="Top roles">
          <BarList items={posItems} />
        </ChartPanel>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Department breakdown by employment type
        </h2>
        {matrix.length === 0 ? (
          <EmptyState
            title="No departments yet"
            hint="Create departments and assign staff to see this matrix."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Department</th>
                <th className="th">Total</th>
                <th className="th">Full-time</th>
                <th className="th">Part-time</th>
                <th className="th">Casual</th>
                <th className="th">Contract</th>
                <th className="th">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matrix.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">{d.name}</td>
                  <td className="td tabular-nums text-slate-700">{d.total}</td>
                  <td className="td tabular-nums text-slate-600">{d.fullTime}</td>
                  <td className="td tabular-nums text-slate-600">{d.partTime}</td>
                  <td className="td tabular-nums text-slate-600">{d.casual}</td>
                  <td className="td tabular-nums text-slate-600">{d.contract}</td>
                  <td className="td">
                    <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${Math.round((d.total / Math.max(1, total)) * 100)}%` }}
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
