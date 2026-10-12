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

const startOfRange = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
};

export default async function HrOnboardingReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();
  const range = intParam(sp.range, 365, 3650);
  const since = startOfRange(range);
  const now = new Date();

  const [
    tasks,
    starters,
    checklists,
    departments,
    byStatus,
    byCategory,
    byStage,
  ] = await Promise.all([
    prisma.onboardingTask.findMany({
      where: { organisationId, stage: "ONBOARDING" },
      select: {
        id: true,
        checklistId: true,
        status: true,
        category: true,
        dueDate: true,
        completedAt: true,
        employee: { select: { id: true, firstName: true, lastName: true, hireDate: true } },
        checklist: { select: { id: true, name: true } },
      },
    }),
    prisma.employee.findMany({
      where: { organisationId, hireDate: { gte: since } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        hireDate: true,
        employmentStatus: true,
        departmentId: true,
      },
      orderBy: { hireDate: "desc" },
    }),
    prisma.onboardingChecklist.findMany({
      where: { organisationId },
      select: { id: true, name: true, roleCategory: true, isDefault: true },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where: { organisationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.onboardingTask.groupBy({
      by: ["status"],
      where: { organisationId, stage: "ONBOARDING" },
      _count: { _all: true },
    }),
    prisma.onboardingTask.groupBy({
      by: ["category"],
      where: { organisationId, stage: "ONBOARDING" },
      _count: { _all: true },
    }),
    prisma.onboardingTask.groupBy({
      by: ["stage"],
      where: { organisationId },
      _count: { _all: true },
    }),
  ]);

  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  const totalTasks = tasks.length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const completionRate = totalTasks ? Math.round((completed / totalTasks) * 100) : 0;
  const blocked = tasks.filter((t) => t.status === "BLOCKED").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;

  // ── status donut ──
  const statusSegments: DonutSegment[] = byStatus
    .map((s) => ({
      label: pretty(s.status),
      value: s._count._all,
      tone: TASK_TONE[s.status] ?? "slate",
    }))
    .sort((a, b) => b.value - a.value);

  // ── category bars ──
  const categoryItems: BarItem[] = [...byCategory]
    .sort((a, b) => b._count._all - a._count._all)
    .map((c) => ({ label: c.category, value: c._count._all, tone: "sky" }));

  // ── stage split ──
  const stageSegments: DonutSegment[] = byStage
    .map(
      (s): DonutSegment => ({
        label: pretty(s.stage),
        value: s._count._all,
        tone: s.stage === "ONBOARDING" ? "sky" : "violet",
      })
    )
    .sort((a, b) => b.value - a.value);

  // ── new starters trend ──
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
  for (const e of starters) {
    const key = `${e.hireDate.getFullYear()}-${String(e.hireDate.getMonth() + 1).padStart(2, "0")}`;
    const idx = monthIdx.get(key);
    if (idx !== undefined) months[idx].count += 1;
  }
  const starterPoints: ColumnPoint[] = months.map((m) => ({
    label: m.label,
    value: m.count,
    tone: "sky",
  }));

  // ── starters by department ──
  const starterDept = new Map<string, number>();
  for (const e of starters) {
    const k = e.departmentId ?? "none";
    starterDept.set(k, (starterDept.get(k) ?? 0) + 1);
  }
  const starterDeptItems: BarItem[] = [...starterDept.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      label: id === "none" ? "Unassigned" : deptName.get(id) ?? "Unknown",
      value: count,
      tone: "emerald",
    }));

  // ── checklist completion ──
  const checklistRows = checklists
    .map((c) => {
      const own = tasks.filter((t) => t.checklistId === c.id);
      const done = own.filter((t) => t.status === "COMPLETED").length;
      return {
        id: c.id,
        name: c.name,
        roleCategory: c.roleCategory,
        isDefault: c.isDefault,
        total: own.length,
        completed: done,
        rate: own.length ? Math.round((done / own.length) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div>
      <PageHeader
        title="Onboarding Reports"
        subtitle="New starters over time, checklist completion and task status mix."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {RANGE_CHIPS.map((d) => (
            <a
              key={d}
              href={`/hr/reports/onboarding${qs({ range: d })}`}
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
          New starters hired inside the selected range
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="New starters" value={starters.length} hint={`Last ${RANGE_LABEL[range] ?? `${range} days`}`} tone="sky" />
        <StatCard label="Onboarding tasks" value={totalTasks} hint={`${checklists.length} checklists`} tone="indigo" />
        <StatCard
          label="Completion"
          value={`${completionRate}%`}
          hint={`${completed} of ${totalTasks} done`}
          tone={completionRate >= 70 ? "emerald" : "amber"}
        />
        <StatCard label="In progress" value={inProgress} hint="Active tasks" tone="sky" />
        <StatCard label="Blocked" value={blocked} hint="Needs intervention" tone={blocked ? "rose" : "emerald"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel
          className="lg:col-span-2"
          title="New starters by month"
          subtitle={`Last ${months.length} months`}
        >
          <ColumnChart points={starterPoints} tone="sky" height={160} />
        </ChartPanel>

        <ChartPanel title="Task status mix" subtitle="Onboarding stage">
          <Donut
            segments={statusSegments}
            size={148}
            thickness={18}
            centerValue={totalTasks}
            centerLabel="tasks"
          />
        </ChartPanel>

        <ChartPanel title="Checklist completion" subtitle="Across onboarding stage">
          <ProgressBar value={completed} max={Math.max(1, totalTasks)} tone="emerald" label="Tasks completed" />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <Donut
              segments={stageSegments}
              size={120}
              thickness={14}
              centerValue={byStage.reduce((a, s) => a + s._count._all, 0)}
              centerLabel="all tasks"
            />
          </div>
        </ChartPanel>

        <ChartPanel title="Tasks by category" subtitle="Where the work sits">
          <BarList items={categoryItems} />
        </ChartPanel>

        <ChartPanel title="New starters by department" subtitle="Hires in range">
          <BarList items={starterDeptItems} />
        </ChartPanel>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Checklist completion</h2>
        {checklistRows.length === 0 ? (
          <EmptyState
            title="No onboarding checklists yet"
            hint="Create a checklist to track onboarding progress."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Checklist</th>
                <th className="th">Role category</th>
                <th className="th">Tasks</th>
                <th className="th">Completed</th>
                <th className="th">Completion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {checklistRows.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    {c.isDefault && <Badge tone="blue">DEFAULT</Badge>}
                  </td>
                  <td className="td text-slate-600">{c.roleCategory ?? "—"}</td>
                  <td className="td tabular-nums text-slate-700">{c.total}</td>
                  <td className="td tabular-nums text-slate-700">{c.completed}</td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${c.rate}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-slate-600">{c.rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Recent starters</h2>
        {starters.length === 0 ? (
          <EmptyState
            title="No new starters in this range"
            hint="Widen the date range to see more hires."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Department</th>
                <th className="th">Start date</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {starters.slice(0, 12).map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">
                    {e.firstName} {e.lastName}
                  </td>
                  <td className="td text-slate-600">
                    {e.departmentId ? deptName.get(e.departmentId) ?? "—" : "—"}
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{formatDate(e.hireDate)}</td>
                  <td className="td">
                    <Badge tone={e.employmentStatus === "PROBATION" ? "blue" : "green"}>
                      {e.employmentStatus}
                    </Badge>
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
