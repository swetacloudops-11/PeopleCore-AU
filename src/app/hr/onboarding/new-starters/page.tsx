import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, strParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import {
  BarList,
  ChartPanel,
  ColumnChart,
  Donut,
  ProgressBar,
  type ColumnPoint,
  type DonutSegment,
} from "@/components/charts";
import { formatDate, initials, cx } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "green",
  PROBATION: "blue",
  CASUAL: "purple",
  CONTRACT: "amber",
  LEAVE: "blue",
  TERMINATED: "red",
};

const TYPE_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CASUAL: "Casual",
  CONTRACT: "Contract",
};

const WINDOWS = [30, 60, 90] as const;

export default async function NewStartersPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();

  const q = strParam(sp.q);
  const parsedWindow = Number.parseInt(strParam(sp.w) || "90", 10);
  const windowDays = (WINDOWS as readonly number[]).includes(parsedWindow) ? parsedWindow : 90;

  const employees = await prisma.employee.findMany({
    where: {
      organisationId,
      employmentStatus: { not: "TERMINATED" },
      hireDate: { gte: D(-windowDays) },
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { employeeNumber: { contains: q, mode: "insensitive" as const } },
              { workEmail: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { hireDate: "desc" },
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
          stage: "ONBOARDING",
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

  const now = D(0).getTime();
  const last30 = employees.filter((e) => e.hireDate.getTime() >= D(-30).getTime()).length;
  const last60 = employees.filter((e) => e.hireDate.getTime() >= D(-60).getTime()).length;
  const totalTaskCount = tasks.length;
  const doneTaskCount = tasks.filter(
    (t) => t.status === "COMPLETED" || t.status === "WAIVED"
  ).length;
  const avgPct = totalTaskCount ? Math.round((doneTaskCount / totalTaskCount) * 100) : 0;
  const withOpen = employees.filter((e) => {
    const p = progress.get(e.id);
    return !p || p.done < p.total || p.blocked > 0;
  }).length;

  // ── Hires per week across the selected window (oldest → newest) ──
  const weekMs = 7 * 86_400_000;
  const weeks = Math.max(1, Math.ceil(windowDays / 7));
  const buckets = Array.from({ length: weeks }, () => 0);
  for (const e of employees) {
    const age = Math.floor((now - e.hireDate.getTime()) / weekMs);
    const clamped = Math.min(weeks - 1, Math.max(0, age));
    buckets[weeks - 1 - clamped] += 1;
  }
  const hirePoints: ColumnPoint[] = buckets.map((value, i) => {
    const weeksAgo = weeks - 1 - i;
    return { label: weeksAgo === 0 ? "Now" : `-${weeksAgo}w`, value, tone: "sky" };
  });

  // ── New starters by department ──
  const deptCounts = employees.reduce<Record<string, number>>((acc, e) => {
    const key = e.department?.name ?? "Unassigned";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const deptItems = Object.entries(deptCounts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const completionSegments: DonutSegment[] = (
    [
      { label: "On track", value: employees.length - withOpen, tone: "emerald" },
      { label: "Needs follow-up", value: withOpen, tone: "amber" },
    ] as DonutSegment[]
  ).filter((s) => s.value > 0);

  return (
    <div>
      <PageHeader
        title="New Starters"
        subtitle="Recently hired employees and how their onboarding is tracking."
        action={{ label: "Onboarding tasks", href: "/hr/onboarding/tasks" }}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="New starters" value={employees.length} hint={`Hired in last ${windowDays} days`} tone="sky" />
        <StatCard label="Last 30 days" value={last30} hint={`${last60} in 60 days`} tone="emerald" />
        <StatCard label="Onboarding avg" value={`${avgPct}%`} hint={`${doneTaskCount}/${totalTaskCount} tasks done`} tone={avgPct >= 70 ? "emerald" : "amber"} />
        <StatCard label="Needs follow-up" value={withOpen} hint="Open or blocked tasks" tone={withOpen ? "rose" : "emerald"} />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <ChartPanel title="Hires by week" subtitle={`Start dates across the last ${windowDays} days`}>
          <ColumnChart points={hirePoints} tone="sky" height={128} valueFormat={(v) => `${v}`} />
        </ChartPanel>

        <ChartPanel title="By department" subtitle="Where new starters are landing">
          <BarList items={deptItems} tone="sky" valueFormat={(v) => String(v)} />
        </ChartPanel>

        <ChartPanel title="Onboarding health" subtitle="New starters by task progress">
          <Donut
            segments={completionSegments}
            size={132}
            thickness={16}
            centerValue={employees.length}
            centerLabel="starters"
          />
        </ChartPanel>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/hr/onboarding/new-starters${qs({ w, q })}`}
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
            placeholder="Search new starters…"
            className="input !w-56"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
          {q && (
            <Link href={`/hr/onboarding/new-starters?w=${windowDays}`} className="text-xs text-slate-500 hover:underline">
              Clear
            </Link>
          )}
        </form>
      </div>

      {employees.length === 0 ? (
        <EmptyState
          title="No new starters in this window"
          hint={`No employees were hired in the last ${windowDays} days. Try a longer window.`}
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Employee</th>
              <th className="th">Role</th>
              <th className="th">Department</th>
              <th className="th">Location</th>
              <th className="th">Started</th>
              <th className="th">Tenure</th>
              <th className="th">Status</th>
              <th className="th w-56">Onboarding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((e) => {
              const p = progress.get(e.id) ?? { total: 0, done: 0, blocked: 0 };
              const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
              const days = Math.max(0, Math.round((now - e.hireDate.getTime()) / 86_400_000));
              return (
                <tr key={e.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-50 text-[11px] font-semibold text-sky-600">
                        {initials(`${e.firstName} ${e.lastName}`)}
                      </span>
                      <div>
                        <Link
                          href={`/hr/employees/${e.id}`}
                          className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                        >
                          {e.firstName} {e.lastName}
                        </Link>
                        <div className="text-[11px] text-slate-400">
                          {e.employeeNumber}
                          {e.workEmail ? ` · ${e.workEmail}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="td">
                    <div className="text-slate-700">{e.position?.title ?? "—"}</div>
                    <div className="text-[11px] text-slate-400">
                      {TYPE_LABEL[e.employmentType] ?? e.employmentType}
                    </div>
                  </td>
                  <td className="td text-slate-600">{e.department?.name ?? "—"}</td>
                  <td className="td text-slate-600">{e.location?.name ?? "—"}</td>
                  <td className="td whitespace-nowrap text-slate-500">{formatDate(e.hireDate)}</td>
                  <td className="td whitespace-nowrap text-slate-600">
                    {days === 0 ? "Started today" : `${days} day${days === 1 ? "" : "s"}`}
                  </td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[e.employmentStatus] ?? "slate"}>
                      {e.employmentStatus}
                    </Badge>
                  </td>
                  <td className="td">
                    {p.total === 0 ? (
                      <span className="text-xs text-slate-400">No tasks assigned</span>
                    ) : (
                      <ProgressBar
                        value={p.done}
                        max={p.total}
                        tone={p.blocked > 0 ? "rose" : pct >= 70 ? "emerald" : "sky"}
                        label={`${p.done}/${p.total} tasks${p.blocked ? ` · ${p.blocked} blocked` : ""}`}
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
