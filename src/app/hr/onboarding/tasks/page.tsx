import Link from "next/link";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { BarList, ChartPanel, Donut, ProgressBar, type DonutSegment } from "@/components/charts";
import { formatDate, cx } from "@/lib/format";
import TaskActions, { NewTaskButton } from "./TaskActions";

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

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] as const;

export default async function OnboardingTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    checklist?: string;
    category?: string;
    emp?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();

  const status = parseEnum(TaskStatus, sp.status);
  const checklistId = strParam(sp.checklist);
  const category = strParam(sp.category);
  const emp = strParam(sp.emp);
  const q = strParam(sp.q);
  const page = intParam(sp.page, 1, 500);

  const today = D(0);
  const tomorrow = D(1);
  const weekEnd = D(7);

  const where = {
    organisationId,
    stage: "ONBOARDING" as const,
    ...(status ? { status } : {}),
    ...(checklistId ? { checklistId } : {}),
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
    dueSoon,
    tasks,
    taskCount,
    categories,
    checklists,
    employees,
    byStatus,
  ] = await Promise.all([
    prisma.onboardingTask.count({ where: { organisationId, stage: "ONBOARDING" } }),
    prisma.onboardingTask.count({
      where: { organisationId, stage: "ONBOARDING", status: { in: ["COMPLETED", "WAIVED"] } },
    }),
    prisma.onboardingTask.count({
      where: {
        organisationId,
        stage: "ONBOARDING",
        status: { in: [...OPEN_STATUSES] },
        dueDate: { lt: today },
      },
    }),
    prisma.onboardingTask.count({
      where: {
        organisationId,
        stage: "ONBOARDING",
        status: { in: [...OPEN_STATUSES] },
        dueDate: { gte: today, lt: tomorrow },
      },
    }),
    prisma.onboardingTask.count({
      where: {
        organisationId,
        stage: "ONBOARDING",
        status: { in: [...OPEN_STATUSES] },
        dueDate: { gte: today, lt: weekEnd },
      },
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
      where: { organisationId, stage: "ONBOARDING" },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
    prisma.onboardingChecklist.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { tasks: true } } },
    }),
    prisma.employee.findMany({
      where: { organisationId, employmentStatus: { not: "TERMINATED" } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.onboardingTask.groupBy({
      by: ["status"],
      where: { organisationId, stage: "ONBOARDING" },
      _count: true,
    }),
  ]);

  const completedPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const statusCount = (s: string) => byStatus.find((r) => r.status === s)?._count ?? 0;
  const totalPages = Math.max(1, Math.ceil(taskCount / PAGE_SIZE));

  const filters = {
    status: status || undefined,
    checklist: checklistId || undefined,
    category: category || undefined,
    emp: emp || undefined,
    q: q || undefined,
  };

  const employeeOptions = employees.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName} · ${e.employeeNumber}`,
  }));

  const checklistOptions = checklists.map((c) => ({
    id: c.id,
    name: `${c.name} (${c._count.tasks})`,
  }));

  return (
    <div>
      <PageHeader
        title="Onboarding Tasks"
        subtitle="Every task on an onboarding checklist — start, complete, block or waive in place."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Open" value={totalTasks - doneTasks} hint="Not yet complete" tone="sky" />
        <StatCard label="Overdue" value={overdue} hint="Past due date" tone={overdue ? "rose" : "emerald"} />
        <StatCard label="Due today" value={dueToday} hint="Finish today" tone={dueToday ? "amber" : "emerald"} />
        <StatCard label="Due this week" value={dueSoon} hint="Next 7 days" tone="indigo" />
        <StatCard
          label="Completion"
          value={`${completedPct}%`}
          hint={`${doneTasks}/${totalTasks} tasks`}
          tone={completedPct >= 70 ? "emerald" : "sky"}
        />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Tasks by status" subtitle="All onboarding tasks on record">
          <Donut
            segments={(
              [
                { label: "Completed", value: statusCount("COMPLETED"), tone: "emerald" },
                { label: "In progress", value: statusCount("IN_PROGRESS"), tone: "sky" },
                { label: "Not started", value: statusCount("NOT_STARTED"), tone: "slate" },
                { label: "Blocked", value: statusCount("BLOCKED"), tone: "rose" },
                { label: "Waived", value: statusCount("WAIVED"), tone: "amber" },
              ] as DonutSegment[]
            ).filter((s) => s.value > 0)}
            size={134}
            thickness={16}
            centerValue={`${completedPct}%`}
            centerLabel="complete"
          />
        </ChartPanel>

        <ChartPanel title="Tasks by checklist" subtitle="Workload across onboarding templates">
          <BarList
            items={checklists.map((c) => ({
              label: c.name,
              value: c._count.tasks,
              tone: "sky" as const,
              href: `/hr/onboarding/tasks${qs({ checklist: c.id, page: 1 })}`,
            }))}
            valueFormat={(v) => String(v)}
          />
          <div className="mt-4 border-t border-slate-100 pt-3">
            <ProgressBar
              value={doneTasks}
              max={Math.max(1, totalTasks)}
              tone={completedPct >= 70 ? "emerald" : "sky"}
              label="Overall completion"
            />
          </div>
        </ChartPanel>
      </div>

      {/* ── Filters ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex flex-wrap items-center gap-2" method="get">
          <input
            name="q"
            key={`q-${q}`}
            defaultValue={q}
            placeholder="Search tasks…"
            className="input !w-48"
          />
          <select name="status" key={`s-${status}`} defaultValue={status} className="input !w-40">
            <option value="">Any status</option>
            {(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "WAIVED"] as const).map((s) => (
              <option key={s} value={s}>
                {pretty(s)}
              </option>
            ))}
          </select>
          <select
            name="checklist"
            key={`c-${checklistId}`}
            defaultValue={checklistId}
            className="input !w-52"
          >
            <option value="">Any checklist</option>
            {checklists.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="category" key={`cat-${category}`} defaultValue={category} className="input !w-36">
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
          {(status || checklistId || category || emp || q) && (
            <Link href="/hr/onboarding/tasks" className="text-xs text-slate-500 hover:underline">
              Clear
            </Link>
          )}
        </form>

        <div className="ml-auto" id="new-task">
          <NewTaskButton
            employees={employeeOptions}
            checklists={checklistOptions}
            defaultStage="ONBOARDING"
            defaultEmployeeId={emp || undefined}
          />
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="No onboarding tasks match these filters"
          hint="Clear the filters or create a new onboarding task."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Task</th>
              <th className="th">Employee</th>
              <th className="th">Checklist</th>
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
                    {t.description && (
                      <div className="max-w-xs truncate text-xs text-slate-400">{t.description}</div>
                    )}
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
                  <td className="td text-slate-600">
                    {t.checklist ? t.checklist.name : <span className="text-slate-400">No checklist</span>}
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
                href={`/hr/onboarding/tasks${qs({ ...filters, page: page - 1 })}`}
                className="btn-secondary !py-1.5 text-xs"
              >
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/hr/onboarding/tasks${qs({ ...filters, page: page + 1 })}`}
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
