import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, strParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import {
  BarList,
  ChartPanel,
  ColumnChart,
  ProgressBar,
  type ColumnPoint,
} from "@/components/charts";
import { formatDate, cx } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const WINDOWS = [30, 90, 180, 365] as const;

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "green",
  PROBATION: "blue",
  CASUAL: "purple",
  CONTRACT: "amber",
  LEAVE: "blue",
  TERMINATED: "red",
};

export default async function EmployeesLeavingPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();

  const q = strParam(sp.q);
  const parsedWindow = Number.parseInt(strParam(sp.w) || "180", 10);
  const windowDays = (WINDOWS as readonly number[]).includes(parsedWindow) ? parsedWindow : 180;

  const employees = await prisma.employee.findMany({
    where: {
      organisationId,
      terminationDate: { not: null, gte: D(-windowDays) },
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { employeeNumber: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { terminationDate: "asc" },
    include: {
      position: { select: { title: true } },
      department: { select: { name: true } },
      location: { select: { name: true } },
    },
  });

  const employeeIds = employees.map((e) => e.id);
  const tasks = employeeIds.length
    ? await prisma.onboardingTask.findMany({
        where: {
          organisationId,
          stage: "OFFBOARDING",
          employeeId: { in: employeeIds },
        },
        select: { employeeId: true, status: true },
      })
    : [];

  const progress = new Map<string, { total: number; done: number; blocked: number }>();
  for (const t of tasks) {
    if (!t.employeeId) continue;
    const row = progress.get(t.employeeId) ?? { total: 0, done: 0, blocked: 0 };
    row.total += 1;
    if (t.status === "COMPLETED" || t.status === "WAIVED") row.done += 1;
    if (t.status === "BLOCKED") row.blocked += 1;
    progress.set(t.employeeId, row);
  }

  const today = D(0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const upcoming = employees.filter(
    (e) => e.terminationDate && e.terminationDate.getTime() >= today.getTime()
  ).length;
  const thisMonth = employees.filter(
    (e) =>
      e.terminationDate &&
      e.terminationDate.getTime() >= monthStart.getTime() &&
      e.terminationDate.getTime() < monthEnd.getTime()
  ).length;
  const terminated = employees.filter((e) => e.employmentStatus === "TERMINATED").length;

  // ── Exits by month, last 6 months ──
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
    return { label: d.toLocaleString("en-AU", { month: "short" }), start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 1) };
  });
  const exitPoints: ColumnPoint[] = months.map((m) => ({
    label: m.label,
    value: employees.filter(
      (e) =>
        e.terminationDate &&
        e.terminationDate.getTime() >= m.start.getTime() &&
        e.terminationDate.getTime() < m.end.getTime()
    ).length,
    tone: "rose",
  }));

  // ── Exits by reason ──
  const reasonCounts = employees.reduce<Record<string, number>>((acc, e) => {
    const key = e.terminationReason?.trim() || "Not stated";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const reasonItems = Object.entries(reasonCounts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Employees Leaving"
        subtitle="Upcoming exits and recent terminations, with exit-checklist progress."
        action={{ label: "Exit checklist", href: "/hr/offboarding/checklist" }}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Leaving in window" value={employees.length} hint={`Last ${windowDays} days + upcoming`} tone="sky" />
        <StatCard label="Upcoming exits" value={upcoming} hint="Termination date ahead" tone={upcoming ? "amber" : "emerald"} />
        <StatCard label="Exiting this month" value={thisMonth} hint="Termination date this month" tone="indigo" />
        <StatCard label="Terminated" value={terminated} hint="Marked terminated" tone="rose" />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Exits by month" subtitle="Termination dates over the last six months">
          <ColumnChart points={exitPoints} tone="rose" height={128} valueFormat={(v) => `${v}`} />
        </ChartPanel>

        <ChartPanel title="Reasons for leaving" subtitle="Most common termination reasons">
          <BarList items={reasonItems} tone="rose" valueFormat={(v) => String(v)} />
        </ChartPanel>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/hr/offboarding/leaving${qs({ w, q })}`}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                windowDays === w
                  ? "bg-sky-500 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              Last {w} days
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2" method="get">
          <input type="hidden" name="w" value={windowDays} />
          <input
            name="q"
            key={`q-${q}`}
            defaultValue={q}
            placeholder="Search employees…"
            className="input !w-56"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
          {q && (
            <Link href={`/hr/offboarding/leaving?w=${windowDays}`} className="text-xs text-slate-500 hover:underline">
              Clear
            </Link>
          )}
        </form>
      </div>

      {employees.length === 0 ? (
        <EmptyState
          title="No employees leaving in this window"
          hint="Employees with an upcoming or recent termination date will appear here."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Employee</th>
              <th className="th">Role</th>
              <th className="th">Department</th>
              <th className="th">Location</th>
              <th className="th">Termination</th>
              <th className="th">Reason</th>
              <th className="th">Status</th>
              <th className="th w-52">Exit checklist</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((e) => {
              const p = progress.get(e.id) ?? { total: 0, done: 0, blocked: 0 };
              const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
              const isUpcoming = e.terminationDate && e.terminationDate.getTime() > today.getTime();
              return (
                <tr key={e.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <Link
                      href={`/hr/employees/${e.id}`}
                      className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                    >
                      {e.firstName} {e.lastName}
                    </Link>
                    <div className="text-[11px] text-slate-400">{e.employeeNumber}</div>
                  </td>
                  <td className="td text-slate-600">{e.position?.title ?? "—"}</td>
                  <td className="td text-slate-600">{e.department?.name ?? "—"}</td>
                  <td className="td text-slate-600">{e.location?.name ?? "—"}</td>
                  <td className="td whitespace-nowrap">
                    <span className={cx("font-medium", isUpcoming ? "text-amber-700" : "text-rose-700")}>
                      {formatDate(e.terminationDate)}
                    </span>
                    {isUpcoming && <div className="text-[11px] text-amber-500">Upcoming</div>}
                  </td>
                  <td className="td text-slate-600">{e.terminationReason ?? "—"}</td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[e.employmentStatus] ?? "slate"}>
                      {e.employmentStatus}
                    </Badge>
                  </td>
                  <td className="td">
                    {p.total === 0 ? (
                      <span className="text-xs text-slate-400">No exit tasks</span>
                    ) : (
                      <ProgressBar
                        value={p.done}
                        max={p.total}
                        tone={p.blocked > 0 ? "rose" : pct >= 70 ? "emerald" : "sky"}
                        label={`${p.done}/${p.total} tasks`}
                        size="sm"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
