import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import {
  ChartPanel,
  Donut,
  BarList,
  ColumnChart,
  ProgressBar,
  type DonutSegment,
  type BarItem,
  type ColumnPoint,
  type Tone,
} from "@/components/charts";
import { formatDate, cx } from "@/lib/format";

const RANGE_CHIPS = [30, 90, 180, 365, 1095] as const;
const RANGE_LABEL: Record<number, string> = {
  30: "30 days",
  90: "90 days",
  180: "6 months",
  365: "12 months",
  1095: "3 years",
};

const TASK_TONE: Record<string, Tone> = {
  COMPLETED: "emerald",
  IN_PROGRESS: "sky",
  NOT_STARTED: "slate",
  BLOCKED: "rose",
  WAIVED: "amber",
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

export default async function HrOffboardingReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();
  const range = intParam(sp.range, 365, 3650);
  const since = startOfRange(range);
  const now = new Date();

  const [leavers, tasks, departments, byStatus, byCategory] = await Promise.all([
    prisma.employee.findMany({
      where: { organisationId, terminationDate: { not: null } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        hireDate: true,
        terminationDate: true,
        terminationReason: true,
        departmentId: true,
      },
      orderBy: { terminationDate: "desc" },
    }),
    prisma.onboardingTask.findMany({
      where: { organisationId, stage: "OFFBOARDING" },
      select: {
        id: true,
        status: true,
        category: true,
        dueDate: true,
        completedAt: true,
        employeeId: true,
      },
    }),
    prisma.department.findMany({
      where: { organisationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.onboardingTask.groupBy({
      by: ["status"],
      where: { organisationId, stage: "OFFBOARDING" },
      _count: { _all: true },
    }),
    prisma.onboardingTask.groupBy({
      by: ["category"],
      where: { organisationId, stage: "OFFBOARDING" },
      _count: { _all: true },
    }),
  ]);

  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const exitsInRange = leavers.filter(
    (e) => e.terminationDate !== null && e.terminationDate >= since
  );

  const avgTenureYears = exitsInRange.length
    ? (
        exitsInRange.reduce(
          (sum, e) =>
            sum +
            (e.terminationDate
              ? monthsBetween(e.hireDate, e.terminationDate)
              : 0),
          0
        ) /
        exitsInRange.length /
        12
      ).toFixed(1)
    : "0.0";

  const totalTasks = tasks.length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const completionRate = totalTasks ? Math.round((completed / totalTasks) * 100) : 0;
  const pendingTasks = tasks.filter(
    (t) => t.status === "NOT_STARTED" || t.status === "IN_PROGRESS" || t.status === "BLOCKED"
  ).length;

  // ── task status donut ──
  const statusSegments: DonutSegment[] = byStatus
    .map((s) => ({
      label: pretty(s.status),
      value: s._count._all,
      tone: TASK_TONE[s.status] ?? "slate",
    }))
    .sort((a, b) => b.value - a.value);

  const categoryItems: BarItem[] = [...byCategory]
    .sort((a, b) => b._count._all - a._count._all)
    .map((c) => ({ label: c.category, value: c._count._all, tone: "rose" }));

  // ── exits trend ──
  const monthCount = Math.min(12, Math.max(3, Math.round(range / 30)));
  const months: { key: string; label: string; count: number }[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
      count: 0,
    });
  }
  const monthIdx = new Map(months.map((m, i) => [m.key, i]));
  for (const e of leavers) {
    if (!e.terminationDate) continue;
    const key = `${e.terminationDate.getFullYear()}-${String(
      e.terminationDate.getMonth() + 1
    ).padStart(2, "0")}`;
    const idx = monthIdx.get(key);
    if (idx !== undefined) months[idx].count += 1;
  }
  const exitPoints: ColumnPoint[] = months.map((m) => ({
    label: m.label,
    value: m.count,
    tone: "rose",
  }));

  // ── reasons ──
  const reasonCounts = new Map<string, number>();
  for (const e of leavers) {
    const key = e.terminationReason ?? "Not recorded";
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  const reasonItems: BarItem[] = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ label: reason, value: count, tone: "amber" }));

  // ── exits by department ──
  const deptExits = new Map<string, number>();
  for (const e of leavers) {
    const k = e.departmentId ?? "none";
    deptExits.set(k, (deptExits.get(k) ?? 0) + 1);
  }
  const deptItems: BarItem[] = [...deptExits.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      label: id === "none" ? "Unassigned" : deptName.get(id) ?? "Unknown",
      value: count,
      tone: "violet",
    }));

  // ── per-employee task completion ──
  const tasksByEmployee = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    if (!t.employeeId) continue;
    const cur = tasksByEmployee.get(t.employeeId) ?? { total: 0, done: 0 };
    cur.total += 1;
    if (t.status === "COMPLETED") cur.done += 1;
    tasksByEmployee.set(t.employeeId, cur);
  }

  return (
    <div>
      <PageHeader
        title="Offboarding Reports"
        subtitle="Exits over time, termination reasons and exit-task completion."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {RANGE_CHIPS.map((d) => (
            <a
              key={d}
              href={`/hr/reports/offboarding${qs({ range: d })}`}
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
          Exits with a termination date inside the range
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Exits" value={exitsInRange.length} hint={`Last ${RANGE_LABEL[range] ?? `${range} days`}`} tone="rose" />
        <StatCard label="Avg tenure at exit" value={`${avgTenureYears} yrs`} hint="Hire to termination" tone="sky" />
        <StatCard label="Exit tasks" value={totalTasks} hint="Offboarding stage" tone="indigo" />
        <StatCard
          label="Task completion"
          value={`${completionRate}%`}
          hint={`${completed} of ${totalTasks} done`}
          tone={completionRate >= 70 ? "emerald" : "amber"}
        />
        <StatCard label="Outstanding" value={pendingTasks} hint="Open exit tasks" tone={pendingTasks ? "amber" : "emerald"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel
          className="lg:col-span-2"
          title="Exits by month"
          subtitle={`Last ${months.length} months`}
        >
          <ColumnChart points={exitPoints} tone="rose" height={160} />
        </ChartPanel>

        <ChartPanel title="Exit task status" subtitle="Offboarding checklist">
          <Donut
            segments={statusSegments}
            size={148}
            thickness={18}
            centerValue={totalTasks}
            centerLabel="tasks"
          />
        </ChartPanel>

        <ChartPanel title="Exit-task completion" subtitle="Across all leavers">
          <ProgressBar value={completed} max={Math.max(1, totalTasks)} tone="emerald" label="Tasks completed" />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <BarList items={categoryItems} />
          </div>
        </ChartPanel>

        <ChartPanel title="Termination reasons" subtitle="All recorded exits">
          <BarList items={reasonItems} />
        </ChartPanel>

        <ChartPanel title="Exits by department" subtitle="All recorded exits">
          <BarList items={deptItems} />
        </ChartPanel>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Recent leavers</h2>
        {leavers.length === 0 ? (
          <EmptyState
            title="No exits on record"
            hint="Termination dates will appear here once employees leave."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Department</th>
                <th className="th">Last day</th>
                <th className="th">Tenure</th>
                <th className="th">Reason</th>
                <th className="th">Exit tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leavers.slice(0, 25).map((e) => {
                const progress = tasksByEmployee.get(e.id);
                const rate = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : null;
                return (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">
                      {e.firstName} {e.lastName}
                    </td>
                    <td className="td text-slate-600">
                      {e.departmentId ? deptName.get(e.departmentId) ?? "—" : "—"}
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {formatDate(e.terminationDate)}
                    </td>
                    <td className="td tabular-nums text-slate-600">
                      {e.terminationDate
                        ? `${(
                            monthsBetween(e.hireDate, e.terminationDate) / 12
                          ).toFixed(1)} yrs`
                        : "—"}
                    </td>
                    <td className="td">
                      <Badge tone="slate">{e.terminationReason ?? "Not recorded"}</Badge>
                    </td>
                    <td className="td">
                      {rate === null ? (
                        <span className="text-xs text-slate-400">No tasks</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-slate-600">{rate}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
