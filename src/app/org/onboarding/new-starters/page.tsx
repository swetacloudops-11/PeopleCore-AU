import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, cx } from "@/lib/format";

export const dynamic = "force-dynamic";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const PAGE_SIZE = 25;
const WINDOWS = [30, 90, 180, 365];

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Progress({ value, tone = "indigo" }: { value: number; tone?: string }) {
  const bar =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "amber"
      ? "bg-amber-500"
      : tone === "rose"
      ? "bg-rose-500"
      : "bg-indigo-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-500">{value}%</span>
    </div>
  );
}

export default async function NewStartersPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const { organisationId } = await orgContext();

  const days = intParam(one(sp.days), 90, 3650);
  const q = strParam(one(sp.q));
  const dept = strParam(one(sp.dept));
  const page = intParam(one(sp.page), 1, 500);

  const windowStart = D(-days);
  const today = D(0);

  const where = {
    organisationId,
    hireDate: { gte: windowStart },
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { employeeNumber: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(dept ? { departmentId: dept } : {}),
  };

  const [employees, departments] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: { hireDate: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        hireDate: true,
        probationEndDate: true,
        employmentType: true,
        employmentStatus: true,
        department: { select: { name: true } },
        position: { select: { title: true } },
        manager: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.department.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const ids = employees.map((e) => e.id);
  const tasks = ids.length
    ? await prisma.onboardingTask.findMany({
        where: {
          organisationId,
          stage: "ONBOARDING",
          employeeId: { in: ids },
        },
        select: { employeeId: true, status: true, dueDate: true },
      })
    : [];

  const progress = new Map<string, { total: number; done: number; open: number }>();
  for (const t of tasks) {
    if (!t.employeeId) continue;
    const cur = progress.get(t.employeeId) ?? { total: 0, done: 0, open: 0 };
    cur.total += 1;
    if (t.status === "COMPLETED" || t.status === "WAIVED") cur.done += 1;
    else cur.open += 1;
    progress.set(t.employeeId, cur);
  }

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(
    (t) => t.status === "COMPLETED" || t.status === "WAIVED"
  ).length;
  const completion = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const upcoming = employees.filter((e) => e.hireDate.getTime() > today.getTime()).length;
  const probation = employees.filter((e) => e.employmentStatus === "PROBATION").length;

  const totalPages = Math.max(1, Math.ceil(employees.length / PAGE_SIZE));
  const rows = employees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filters = { days, q: q || undefined, dept: dept || undefined };

  return (
    <div>
      <PageHeader
        title="New Starters"
        subtitle={`Everyone hired in the last ${days} days, including future start dates.`}
        action={{ label: "Onboarding tasks", href: "/org/onboarding/tasks" }}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="New starters"
          value={employees.length}
          hint={`Last ${days} days`}
          tone="sky"
        />
        <StatCard label="Future starts" value={upcoming} hint="Not started yet" tone="indigo" />
        <StatCard
          label="Onboarding complete"
          value={`${completion}%`}
          hint={`${doneTasks}/${totalTasks} tasks done`}
          tone={completion >= 70 ? "emerald" : "amber"}
        />
        <StatCard label="On probation" value={probation} hint="Within probation window" tone="amber" />
      </div>

      {/* ── Filters ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={qs({ ...filters, days: w, page: 1 })}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                days === w
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              Last {w} days
            </Link>
          ))}
        </div>

        <form className="flex flex-wrap items-center gap-2" method="get">
          <input
            type="hidden"
            name="days"
            value={days}
          />
          <input
            name="q"
            key={q}
            defaultValue={q}
            placeholder="Search name or #…"
            className="input !w-48"
          />
          <select name="dept" key={dept} defaultValue={dept} className="input !w-48">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No new starters in this window"
          hint="Try a longer window or clear the search filters."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Employee</th>
              <th className="th">Start date</th>
              <th className="th">Position</th>
              <th className="th">Department</th>
              <th className="th">Manager</th>
              <th className="th">Type</th>
              <th className="th">Probation end</th>
              <th className="th">Onboarding</th>
              <th className="th text-right">Tasks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((e) => {
              const p = progress.get(e.id) ?? { total: 0, done: 0, open: 0 };
              const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
              const isFuture = e.hireDate.getTime() > today.getTime();
              return (
                <tr key={e.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">
                      {e.firstName} {e.lastName}
                    </div>
                    <div className="text-xs text-slate-400">{e.employeeNumber}</div>
                  </td>
                  <td className="td whitespace-nowrap">
                    <div className="text-slate-700">{formatDate(e.hireDate)}</div>
                    {isFuture && <Badge tone="purple">UPCOMING</Badge>}
                  </td>
                  <td className="td text-slate-600">{e.position?.title ?? "—"}</td>
                  <td className="td text-slate-600">{e.department?.name ?? "—"}</td>
                  <td className="td text-slate-600">
                    {e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : "—"}
                  </td>
                  <td className="td">
                    <Badge tone={e.employmentType === "FULL_TIME" ? "blue" : "slate"}>
                      {pretty(e.employmentType)}
                    </Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {e.probationEndDate ? formatDate(e.probationEndDate) : "—"}
                  </td>
                  <td className="td">
                    <Progress
                      value={pct}
                      tone={pct >= 80 ? "emerald" : pct >= 40 ? "amber" : "indigo"}
                    />
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {p.done}/{p.total} tasks
                    </div>
                  </td>
                  <td className="td text-right">
                    <Link
                      href={`/org/onboarding/tasks?emp=${e.id}`}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      View tasks →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      {employees.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, employees.length)} of {employees.length}
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
