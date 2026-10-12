import Link from "next/link";
import { TaskStage, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { ChartPanel, Donut, ProgressBar, type DonutSegment } from "@/components/charts";
import { formatDate, cx } from "@/lib/format";
import TaskActions, { NewTaskButton } from "./TaskActions";

export const dynamic = "force-dynamic";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const PAGE_SIZE = 25;

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const TASK_TONES: Record<string, string> = {
  NOT_STARTED: "slate",
  IN_PROGRESS: "blue",
  BLOCKED: "red",
  COMPLETED: "green",
  WAIVED: "amber",
};

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default async function OnboardingTasksPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const { organisationId } = await orgContext();

  const stage = parseEnum(TaskStage, one(sp.stage));
  const status = parseEnum(TaskStatus, one(sp.status));
  const category = strParam(one(sp.category));
  const emp = strParam(one(sp.emp));
  const q = strParam(one(sp.q));
  const page = intParam(one(sp.page), 1, 500);

  const today = D(0);
  const tomorrow = D(1);
  const openStatuses: Array<"NOT_STARTED" | "IN_PROGRESS" | "BLOCKED"> = [
    "NOT_STARTED",
    "IN_PROGRESS",
    "BLOCKED",
  ];

  const where = {
    organisationId,
    ...(stage ? { stage } : {}),
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
    dueToday,
    overdue,
    tasks,
    taskCount,
    categories,
    employees,
    byStatus,
  ] = await Promise.all([
    prisma.onboardingTask.count({ where: { organisationId } }),
    prisma.onboardingTask.count({
      where: { organisationId, status: { in: ["COMPLETED", "WAIVED"] } },
    }),
    prisma.onboardingTask.count({
      where: {
        organisationId,
        status: { in: openStatuses },
        dueDate: { gte: today, lt: tomorrow },
      },
    }),
    prisma.onboardingTask.count({
      where: {
        organisationId,
        status: { in: openStatuses },
        dueDate: { lt: today },
      },
    }),
    prisma.onboardingTask.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
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
      where: { organisationId },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
    prisma.employee.findMany({
      where: { organisationId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.onboardingTask.groupBy({
      by: ["status"],
      where: { organisationId },
      _count: true,
    }),
  ]);

  const completedPct = totalTasks
    ? Math.round((doneTasks / totalTasks) * 100)
    : 0;

  const statusCount = (s: string) =>
    byStatus.find((r) => r.status === s)?._count ?? 0;
  const totalPages = Math.max(1, Math.ceil(taskCount / PAGE_SIZE));

  const filters = {
    stage: stage || undefined,
    status: status || undefined,
    category: category || undefined,
    emp: emp || undefined,
    q: q || undefined,
  };

  const employeeOptions = employees.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName} · ${e.employeeNumber ?? ""}`.trim(),
  }));

  return (
    <div>
      <PageHeader
        title="Onboarding & Offboarding Tasks"
        subtitle="Every task for this organisation — start, complete, block or waive in place."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Due today" value={dueToday} hint="Open tasks" tone={dueToday ? "amber" : "emerald"} />
        <StatCard label="Overdue" value={overdue} hint="Past due date" tone={overdue ? "rose" : "emerald"} />
        <StatCard
          label="Completed"
          value={`${completedPct}%`}
          hint={`${doneTasks}/${totalTasks} tasks`}
          tone={completedPct >= 70 ? "emerald" : "sky"}
        />
        <StatCard label="Total tasks" value={taskCount} hint="Matching current filters" tone="indigo" />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Tasks by status" subtitle="Every onboarding & offboarding task">
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

        <ChartPanel title="Completion overview" subtitle="Progress against every task on record">
          <div className="pt-2">
            <ProgressBar
              value={doneTasks}
              max={Math.max(1, totalTasks)}
              tone={completedPct >= 70 ? "emerald" : "sky"}
              label="Overall completion"
            />
            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-slate-50 py-3">
                <dt className="text-[10px] uppercase tracking-wide text-slate-400">Done</dt>
                <dd className="text-lg font-semibold text-slate-800">{doneTasks}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 py-3">
                <dt className="text-[10px] uppercase tracking-wide text-slate-400">Remaining</dt>
                <dd className="text-lg font-semibold text-slate-800">
                  {Math.max(0, totalTasks - doneTasks)}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 py-3">
                <dt className="text-[10px] uppercase tracking-wide text-slate-400">Overdue</dt>
                <dd className={`text-lg font-semibold ${overdue ? "text-rose-600" : "text-slate-800"}`}>
                  {overdue}
                </dd>
              </div>
            </dl>
          </div>
        </ChartPanel>
      </div>

      {/* ── Filters ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "All stages", value: "" },
            { label: "Onboarding", value: "ONBOARDING" },
            { label: "Offboarding", value: "OFFBOARDING" },
          ].map((s) => (
            <Link
              key={s.label}
              href={qs({ ...filters, stage: s.value, page: 1 })}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                stage === s.value
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>

        <form className="flex flex-wrap items-center gap-2" method="get">
          <input type="hidden" name="stage" value={stage ?? ""} />
          <input name="q" key={`q-${q}`} defaultValue={q} placeholder="Search tasks…" className="input !w-44" />
          <select name="status" key={`s-${status}`} defaultValue={status} className="input !w-40">
            <option value="">Any status</option>
            {["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "WAIVED"].map((s) => (
              <option key={s} value={s}>
                {pretty(s)}
              </option>
            ))}
          </select>
          <select name="category" key={`c-${category}`} defaultValue={category} className="input !w-36">
            <option value="">Any category</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category}
              </option>
            ))}
          </select>
          <select name="emp" key={`e-${emp}`} defaultValue={emp} className="input !w-48">
            <option value="">Any employee</option>
            {employeeOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>
      </div>

      <div className="mb-3 flex justify-end">
        <NewTaskButton employees={employeeOptions} defaultStage={stage === "OFFBOARDING" ? "OFFBOARDING" : "ONBOARDING"} defaultEmployeeId={emp || undefined} />
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks match these filters"
          hint="Clear the filters or create a new onboarding task."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Task</th>
              <th className="th">Employee</th>
              <th className="th">Stage</th>
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
                <tr key={t.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">{t.title}</div>
                    <div className="text-xs text-slate-400">
                      {t.checklist ? t.checklist.name : "No checklist"}
                    </div>
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
                  <td className="td">
                    <Badge tone={t.stage === "OFFBOARDING" ? "purple" : "blue"}>
                      {pretty(t.stage)}
                    </Badge>
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
              <Link href={qs({ ...filters, page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={qs({ ...filters, page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
