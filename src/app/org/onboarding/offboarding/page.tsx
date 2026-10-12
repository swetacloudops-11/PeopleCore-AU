import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, cx } from "@/lib/format";
import TaskActions, { NewTaskButton } from "../tasks/TaskActions";

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

const STATUS_TONES: Record<string, string> = {
  NOT_STARTED: "slate",
  IN_PROGRESS: "blue",
  BLOCKED: "red",
  COMPLETED: "green",
  WAIVED: "amber",
};

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default async function OffboardingPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const { organisationId } = await orgContext();
  const page = intParam(one(sp.page), 1, 500);
  const today = D(0);

  const leaverWhere = {
    organisationId,
    OR: [{ terminationDate: { not: null } }, { employmentStatus: "TERMINATED" as const }],
  };

  const [leavers, exitTasks, exitTaskCount, employees] = await Promise.all([
    prisma.employee.findMany({
      where: leaverWhere,
      orderBy: { terminationDate: { sort: "desc", nulls: "last" } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        employmentStatus: true,
        terminationDate: true,
        terminationReason: true,
        department: { select: { name: true } },
        position: { select: { title: true } },
      },
    }),
    prisma.onboardingTask.findMany({
      where: { organisationId, stage: "OFFBOARDING" },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        assignee: { select: { name: true } },
        checklist: { select: { name: true } },
      },
    }),
    prisma.onboardingTask.count({ where: { organisationId, stage: "OFFBOARDING" } }),
    prisma.employee.findMany({
      where: { organisationId, employmentStatus: { not: "TERMINATED" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const leaverIds = leavers.map((e) => e.id);
  const leaverTasks = leaverIds.length
    ? await prisma.onboardingTask.findMany({
        where: {
          organisationId,
          stage: "OFFBOARDING",
          employeeId: { in: leaverIds },
        },
        select: { employeeId: true, status: true, dueDate: true },
      })
    : [];

  const byEmp = new Map<string, { total: number; done: number; overdue: number }>();
  for (const t of leaverTasks) {
    if (!t.employeeId) continue;
    const cur = byEmp.get(t.employeeId) ?? { total: 0, done: 0, overdue: 0 };
    cur.total += 1;
    if (t.status === "COMPLETED" || t.status === "WAIVED") cur.done += 1;
    else if (t.dueDate && t.dueDate.getTime() < today.getTime()) cur.overdue += 1;
    byEmp.set(t.employeeId, cur);
  }

  const exitDone = exitTasks.filter(
    (t) => t.status === "COMPLETED" || t.status === "WAIVED"
  ).length;
  const openExit = exitTaskCount - exitDone;
  const exitOverdue = exitTasks.filter(
    (t) =>
      t.status !== "COMPLETED" &&
      t.status !== "WAIVED" &&
      t.dueDate &&
      t.dueDate.getTime() < today.getTime()
  ).length;

  const totalPages = Math.max(1, Math.ceil(exitTaskCount / PAGE_SIZE));
  const employeeOptions = employees.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName}`,
  }));

  return (
    <div>
      <PageHeader
        title="Offboarding"
        subtitle="Leavers and their exit task pipeline — access, equipment and final pay."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Leavers" value={leavers.length} hint="Termination date or TERMINATED" tone="rose" />
        <StatCard label="Exit tasks" value={exitTaskCount} hint="Offboarding stage" tone="indigo" />
        <StatCard label="Exit tasks open" value={openExit} hint={`${exitDone} completed`} tone={openExit ? "amber" : "emerald"} />
        <StatCard label="Exit tasks overdue" value={exitOverdue} hint="Past due date" tone={exitOverdue ? "rose" : "emerald"} />
      </div>

      {/* ── (a) Leavers ── */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Leavers</h2>
        {leavers.length === 0 ? (
          <EmptyState
            title="No leavers on record"
            hint="Employees with a termination date or TERMINATED status appear here."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Last day</th>
                <th className="th">Reason</th>
                <th className="th">Status</th>
                <th className="th">Department</th>
                <th className="th">Exit tasks</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leavers.map((e) => {
                const p = byEmp.get(e.id) ?? { total: 0, done: 0, overdue: 0 };
                const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
                return (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <div className="font-medium text-slate-800">
                        {e.firstName} {e.lastName}
                      </div>
                      <div className="text-xs text-slate-400">{e.employeeNumber}</div>
                    </td>
                    <td className="td whitespace-nowrap text-slate-700">
                      {e.terminationDate ? formatDate(e.terminationDate) : "—"}
                    </td>
                    <td className="td text-slate-600">{e.terminationReason ?? "—"}</td>
                    <td className="td">
                      <Badge tone={e.employmentStatus === "TERMINATED" ? "red" : "amber"}>
                        {pretty(e.employmentStatus)}
                      </Badge>
                    </td>
                    <td className="td text-slate-600">{e.department?.name ?? "—"}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cx(
                              "h-full rounded-full",
                              pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-indigo-500"
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-slate-500">{pct}%</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {p.done}/{p.total} done
                        {p.overdue > 0 && <span className="text-rose-500"> · {p.overdue} overdue</span>}
                      </div>
                    </td>
                    <td className="td text-right">
                      <Link
                        href={`/org/onboarding/tasks?stage=OFFBOARDING&emp=${e.id}`}
                        className="text-xs font-medium text-indigo-600 hover:underline"
                      >
                        Exit tasks →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </section>

      {/* ── (b) Offboarding-stage tasks ── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Offboarding tasks</h2>
          <NewTaskButton
            employees={employeeOptions}
            defaultStage="OFFBOARDING"
            buttonLabel="New exit task"
          />
        </div>

        {exitTasks.length === 0 ? (
          <EmptyState
            title="No offboarding tasks"
            hint="Create an exit task or add offboarding titles to a checklist."
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
              {exitTasks.map((t) => {
                const overdue =
                  t.dueDate &&
                  t.dueDate.getTime() < today.getTime() &&
                  t.status !== "COMPLETED" &&
                  t.status !== "WAIVED";
                return (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <div className="font-medium text-slate-800">{t.title}</div>
                      <div className="text-xs text-slate-400">
                        {t.checklist?.name ?? "No checklist"}
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
                    <td className="td text-slate-600">{t.category}</td>
                    <td className="td text-slate-600">
                      {t.assignee?.name ?? <span className="text-slate-400">Unassigned</span>}
                    </td>
                    <td className="td whitespace-nowrap">
                      <span className={cx(overdue ? "font-medium text-rose-600" : "text-slate-600")}>
                        {t.dueDate ? formatDate(t.dueDate) : "—"}
                      </span>
                      {overdue && <div className="text-[11px] text-rose-500">Overdue</div>}
                    </td>
                    <td className="td">
                      <Badge tone={STATUS_TONES[t.status] ?? "slate"}>{pretty(t.status)}</Badge>
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

        {exitTaskCount > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages} · {exitTaskCount} exit tasks
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={qs({ page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                  ← Previous
                </Link>
              )}
              {page < totalPages && (
                <Link href={qs({ page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
