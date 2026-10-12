import Link from "next/link";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { BarList, ChartPanel, Donut, ProgressBar, type DonutSegment } from "@/components/charts";
import { formatDate, cx } from "@/lib/format";
import TaskActions from "../../onboarding/tasks/TaskActions";

const PAGE_SIZE = 25;

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const TASK_TONES: Record<string, string> = {
  NOT_STARTED: "slate",
  IN_PROGRESS: "blue",
  BLOCKED: "red",
  COMPLETED: "green",
  WAIVED: "amber",
};

const CHART_TONE: Record<string, "emerald" | "sky" | "amber" | "rose" | "slate"> = {
  COMPLETED: "emerald",
  IN_PROGRESS: "sky",
  NOT_STARTED: "slate",
  BLOCKED: "rose",
  WAIVED: "amber",
};

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] as const;

export default async function ExitChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    category?: string;
    emp?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();

  const status = parseEnum(TaskStatus, sp.status);
  const category = strParam(sp.category);
  const emp = strParam(sp.emp);
  const q = strParam(sp.q);
  const page = intParam(sp.page, 1, 500);

  const today = D(0);
  const tomorrow = D(1);

  const where = {
    organisationId,
    stage: "OFFBOARDING" as const,
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(emp ? { employeeId: emp } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { employee: { firstName: { contains: q, mode: "insensitive" as const } } },
            { employee: { lastName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [
    totalTasks,
    doneTasks,
    overdue,
    dueToday,
    blocked,
    tasks,
    taskCount,
    categories,
    employees,
    byStatus,
    byCategory,
  ] = await Promise.all([
    prisma.onboardingTask.count({ where: { organisationId, stage: "OFFBOARDING" } }),
    prisma.onboardingTask.count({
      where: { organisationId, stage: "OFFBOARDING", status: { in: ["COMPLETED", "WAIVED"] } },
    }),
    prisma.onboardingTask.count({
      where: {
        organisationId,
        stage: "OFFBOARDING",
        status: { in: [...OPEN_STATUSES] },
        dueDate: { lt: today },
      },
    }),
    prisma.onboardingTask.count({
      where: {
        organisationId,
        stage: "OFFBOARDING",
        status: { in: [...OPEN_STATUSES] },
        dueDate: { gte: today, lt: tomorrow },
      },
    }),
    prisma.onboardingTask.count({
      where: { organisationId, stage: "OFFBOARDING", status: "BLOCKED" },
    }),
    prisma.onboardingTask.findMany({
      where,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        assignee: { select: { name: true, email: true } },
        checklist: { select: { name: true } },
      },
    }),
    prisma.onboardingTask.count({ where }),
    prisma.onboardingTask.findMany({
      where: { organisationId, stage: "OFFBOARDING" },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
    prisma.employee.findMany({
      where: { organisationId, employmentStatus: { not: "TERMINATED" } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.onboardingTask.groupBy({
      by: ["status"],
      where: { organisationId, stage: "OFFBOARDING" },
      _count: true,
    }),
    prisma.onboardingTask.groupBy({
      by: ["category"],
      where: { organisationId, stage: "OFFBOARDING" },
      _count: true,
      orderBy: { _count: { category: "desc" } },
      take: 8,
    }),
  ]);

  const completedPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const statusCount = (s: string) => byStatus.find((r) => r.status === s)?._count ?? 0;
  const totalPages = Math.max(1, Math.ceil(taskCount / PAGE_SIZE));

  const filters = {
    status: status || undefined,
    category: category || undefined,
    emp: emp || undefined,
    q: q || undefined,
  };

  const statusSegments: DonutSegment[] = (
    ["COMPLETED", "IN_PROGRESS", "NOT_STARTED", "BLOCKED", "WAIVED"] as const
  )
    .map((s) => ({ label: pretty(s), value: statusCount(s), tone: CHART_TONE[s] }))
    .filter((s) => s.value > 0);

  return (
    <div>
      <PageHeader
        title="Exit Checklist"
        subtitle="Every offboarding task — pack down access, assets and final pay in order."
        action={{ label: "Employees leaving", href: "/hr/offboarding/leaving" }}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Open" value={totalTasks - doneTasks} hint="Not yet complete" tone="sky" />
        <StatCard label="Overdue" value={overdue} hint="Past due date" tone={overdue ? "rose" : "emerald"} />
        <StatCard label="Due today" value={dueToday} hint="Finish today" tone={dueToday ? "amber" : "emerald"} />
        <StatCard label="Blocked" value={blocked} hint="Waiting on something" tone={blocked ? "rose" : "emerald"} />
        <StatCard
          label="Completion"
          value={`${completedPct}%`}
          hint={`${doneTasks}/${totalTasks} tasks`}
          tone={completedPct >= 70 ? "emerald" : "sky"}
        />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <ChartPanel title="Exit tasks by status" subtitle="All offboarding tasks on record">
          <Donut
            segments={statusSegments}
            size={132}
            thickness={16}
            centerValue={`${completedPct}%`}
            centerLabel="complete"
          />
        </ChartPanel>

        <ChartPanel title="Tasks by category" subtitle="Where the exit work sits">
          <BarList
            items={byCategory.map((c) => ({ label: c.category, value: c._count, tone: "sky" as const }))}
            valueFormat={(v) => String(v)}
          />
        </ChartPanel>

        <ChartPanel title="Completion" subtitle="Progress across the exit checklist">
          <div className="pt-2">
            <ProgressBar
              value={doneTasks}
              max={Math.max(1, totalTasks)}
              tone={completedPct >= 70 ? "emerald" : "sky"}
              label="Overall exit completion"
            />
            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-slate-50 py-3">
                <dt className="text-[10px] uppercase tracking-wide text-slate-400">Done</dt>
                <dd className="text-lg font-semibold text-slate-800">{doneTasks}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 py-3">
                <dt className="text-[10px] uppercase tracking-wide text-slate-400">Remaining</dt>
                <dd className="text-lg font-semibold text-slate-800">{Math.max(0, totalTasks - doneTasks)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 py-3">
                <dt className="text-[10px] uppercase tracking-wide text-slate-400">Overdue</dt>
                <dd className={cx("text-lg font-semibold", overdue ? "text-rose-600" : "text-slate-800")}>
                  {overdue}
                </dd>
              </div>
            </dl>
          </div>
        </ChartPanel>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex flex-wrap items-center gap-2" method="get">
          <input name="q" key={`q-${q}`} defaultValue={q} placeholder="Search tasks…" className="input !w-48" />
          <select name="status" key={`s-${status}`} defaultValue={status} className="input !w-40">
            <option value="">Any status</option>
            {(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "WAIVED"] as const).map((s) => (
              <option key={s} value={s}>
                {pretty(s)}
              </option>
            ))}
          </select>
          <select name="category" key={`c-${category}`} defaultValue={category} className="input !w-40">
            <option value="">Any category</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category}
              </option>
            ))}
          </select>
          <select name="emp" key={`e-${emp}`} defaultValue={emp} className="input !w-52">
            <option value="">Any employee</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName} · {e.employeeNumber}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
          {(status || category || emp || q) && (
            <Link href="/hr/offboarding/checklist" className="text-xs text-slate-500 hover:underline">
              Clear
            </Link>
          )}
        </form>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="No exit tasks match these filters"
          hint="Offboarding tasks appear here once an employee starts their exit checklist."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Task</th>
              <th className="th">Employee</th>
              <th className="th">Category</th>
              <th className="th">Assignee</th>
              <th className="th">Due</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const isOverdue =
                t.dueDate &&
                t.dueDate.getTime() < today.getTime() &&
                !["COMPLETED", "WAIVED"].includes(t.status);
              return (
                <tr key={t.id} className={cx("hover:bg-slate-50/70", isOverdue && "bg-rose-50/40")}>
                  <td className="td">
                    <div className="font-medium text-slate-800">{t.title}</div>
                    {t.checklist && <div className="text-xs text-slate-400">{t.checklist.name}</div>}
                  </td>
                  <td className="td">
                    {t.employee ? (
                      <>
                        <div className="text-slate-700">
                          {t.employee.firstName} {t.employee.lastName}
                        </div>
                        <div className="text-xs text-slate-400">{t.employee.employeeNumber}</div>
                      </>
                    ) : (
                      <Badge tone="purple">TEMPLATE</Badge>
                    )}
                  </td>
                  <td className="td text-slate-600">{t.category}</td>
                  <td className="td text-slate-600">
                    {t.assignee ? (
                      <>
                        <div>{t.assignee.name}</div>
                        <div className="text-xs text-slate-400">{t.assignee.email}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">Unassigned</span>
                    )}
                  </td>
                  <td className="td whitespace-nowrap">
                    <span className={cx(isOverdue ? "font-medium text-rose-600" : "text-slate-600")}>
                      {t.dueDate ? formatDate(t.dueDate) : "—"}
                    </span>
                    {isOverdue && <div className="text-[11px] text-rose-500">Overdue</div>}
                  </td>
                  <td className="td">
                    <Badge tone={TASK_TONES[t.status] ?? "slate"}>{pretty(t.status)}</Badge>
                  </td>
                  <td className="td text-right">
                    <TaskActions id={t.id} status={t.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      {taskCount > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages} · {taskCount} tasks
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/hr/offboarding/checklist${qs({ ...filters, page: page - 1 })}`}
                className="btn-secondary !py-1.5 text-xs"
              >
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/hr/offboarding/checklist${qs({ ...filters, page: page + 1 })}`}
                className="btn-secondary !py-1.5 text-xs"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
