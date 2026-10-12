import Link from "next/link";
import { TaskStage, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import {
  ChartPanel,
  ColumnChart,
  Donut,
  type ColumnPoint,
  type DonutSegment,
} from "@/components/charts";
import { formatDate, cx } from "@/lib/format";
import TaskActions from "../onboarding/tasks/TaskActions";

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

export default async function PendingHrTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string;
    status?: string;
    category?: string;
    emp?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();

  const stage = parseEnum(TaskStage, sp.stage);
  const status = parseEnum(TaskStatus, sp.status);
  const category = strParam(sp.category);
  const emp = strParam(sp.emp);
  const q = strParam(sp.q);
  const page = intParam(sp.page, 1, 500);

  const today = D(0);
  const tomorrow = D(1);
  const weekEnd = D(7);

  const where = {
    organisationId,
    status: status ?? { in: [...OPEN_STATUSES] },
    ...(stage ? { stage } : {}),
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

  const [matched, categories, employees, openByStatus] = await Promise.all([
    prisma.onboardingTask.findMany({
      where,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 500,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        assignee: { select: { name: true, email: true } },
        checklist: { select: { name: true } },
      },
    }),
    prisma.onboardingTask.findMany({
      where: { organisationId },
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
      where: { organisationId, status: { in: [...OPEN_STATUSES] } },
      _count: true,
    }),
  ]);

  // ── Overdue first, then the rest by due date (already ordered asc, nulls last) ──
  const isOverdueTask = (t: (typeof matched)[number]) =>
    !!t.dueDate && t.dueDate.getTime() < today.getTime() && !["COMPLETED", "WAIVED"].includes(t.status);

  const ordered = [
    ...matched.filter(isOverdueTask),
    ...matched.filter((t) => !isOverdueTask(t)),
  ];
  const total = ordered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const overdue = ordered.filter(isOverdueTask).length;
  const dueToday = ordered.filter(
    (t) => t.dueDate && t.dueDate.getTime() >= today.getTime() && t.dueDate.getTime() < tomorrow.getTime()
  ).length;
  const dueSoon = ordered.filter(
    (t) => t.dueDate && t.dueDate.getTime() >= today.getTime() && t.dueDate.getTime() < weekEnd.getTime()
  ).length;
  const blocked = ordered.filter((t) => t.status === "BLOCKED").length;

  const statusCount = (s: string) => openByStatus.find((r) => r.status === s)?._count ?? 0;
  const statusSegments: DonutSegment[] = (
    [
      { label: "In progress", value: statusCount("IN_PROGRESS"), tone: "sky" },
      { label: "Not started", value: statusCount("NOT_STARTED"), tone: "slate" },
      { label: "Blocked", value: statusCount("BLOCKED"), tone: "rose" },
    ] as DonutSegment[]
  ).filter((s) => s.value > 0);

  const later = ordered.filter((t) => t.dueDate && t.dueDate.getTime() >= weekEnd.getTime()).length;
  const noDate = ordered.filter((t) => !t.dueDate).length;
  const duePoints: ColumnPoint[] = [
    { label: "Overdue", value: overdue, tone: "rose" },
    { label: "Today", value: dueToday, tone: "amber" },
    { label: "This week", value: Math.max(0, dueSoon - dueToday), tone: "sky" },
    { label: "Later", value: later, tone: "slate" },
    { label: "No date", value: noDate, tone: "violet" },
  ];

  const filters = {
    stage: stage || undefined,
    status: status || undefined,
    category: category || undefined,
    emp: emp || undefined,
    q: q || undefined,
  };

  return (
    <div>
      <PageHeader
        title="Pending HR Tasks"
        subtitle="Every open onboarding and offboarding task — overdue work surfaces first."
        action={{ label: "All tasks", href: "/hr/onboarding/tasks" }}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Open tasks" value={total} hint="Matching current filters" tone="sky" />
        <StatCard label="Overdue" value={overdue} hint="Past due date" tone={overdue ? "rose" : "emerald"} />
        <StatCard label="Due today" value={dueToday} hint="Finish today" tone={dueToday ? "amber" : "emerald"} />
        <StatCard label="Due this week" value={dueSoon} hint="Next 7 days" tone="indigo" />
        <StatCard label="Blocked" value={blocked} hint="Waiting on something" tone={blocked ? "rose" : "emerald"} />
      </div>

      {overdue > 0 && (
        <div className="card mb-5 flex flex-wrap items-center gap-3 border-rose-200 bg-rose-50 px-4 py-3">
          <Badge tone="red">{overdue} OVERDUE</Badge>
          <span className="text-sm text-rose-900">
            These tasks are past their due date and need attention first.
          </span>
          <Link
            href={`/hr/tasks${qs({ ...filters, status: "NOT_STARTED", page: 1 })}`}
            className="btn-secondary ml-auto !py-1.5 text-xs"
          >
            Focus overdue →
          </Link>
        </div>
      )}

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Open tasks by status" subtitle="Across both stages">
          {statusSegments.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No open tasks</p>
          ) : (
            <Donut
              segments={statusSegments}
              size={132}
              thickness={16}
              centerValue={total}
              centerLabel="open"
            />
          )}
        </ChartPanel>

        <ChartPanel title="When it is due" subtitle="Open tasks by due window">
          <ColumnChart points={duePoints} tone="sky" height={132} valueFormat={(v) => `${v}`} />
        </ChartPanel>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "All stages", value: "" },
            { label: "Onboarding", value: "ONBOARDING" },
            { label: "Offboarding", value: "OFFBOARDING" },
          ].map((s) => (
            <Link
              key={s.label}
              href={`/hr/tasks${qs({ ...filters, stage: s.value, page: 1 })}`}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                (stage ?? "") === s.value
                  ? "bg-sky-500 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>

        <form className="flex flex-wrap items-center gap-2" method="get">
          {stage && <input type="hidden" name="stage" value={stage} />}
          <input name="q" key={`q-${q}`} defaultValue={q} placeholder="Search tasks…" className="input !w-44" />
          <select name="status" key={`s-${status}`} defaultValue={status} className="input !w-40">
            <option value="">Any open status</option>
            {(["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] as const).map((s) => (
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
          {(stage || status || category || emp || q) && (
            <Link href="/hr/tasks" className="text-xs text-slate-500 hover:underline">
              Clear
            </Link>
          )}
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No open tasks match these filters"
          hint="Nice work — or try clearing the filters to see everything outstanding."
        />
      ) : (
        <>
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
              {rows.map((t) => {
                const isOverdue =
                  t.dueDate &&
                  t.dueDate.getTime() < today.getTime() &&
                  !["COMPLETED", "WAIVED"].includes(t.status);
                const stageHref =
                  t.stage === "OFFBOARDING" ? "/hr/offboarding/checklist" : "/hr/onboarding/tasks";
                return (
                  <tr key={t.id} className={cx("hover:bg-slate-50/70", isOverdue && "bg-rose-50/40")}>
                    <td className="td">
                      <Link
                        href={`${stageHref}${qs({ q: t.title, page: 1 })}`}
                        className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                      >
                        {t.title}
                      </Link>
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
                      {isOverdue && (
                        <div className="mt-0.5">
                          <Badge tone="red">OVERDUE</Badge>
                        </div>
                      )}
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

          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages} · {total} open tasks
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/hr/tasks${qs({ ...filters, page: page - 1 })}`}
                    className="btn-secondary !py-1.5 text-xs"
                  >
                    ← Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/hr/tasks${qs({ ...filters, page: page + 1 })}`}
                    className="btn-secondary !py-1.5 text-xs"
                  >
                    Next →
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
