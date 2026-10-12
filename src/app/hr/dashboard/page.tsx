import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { BarList, ChartPanel, Donut, ProgressBar } from "@/components/charts";
import { formatDate, timeAgo } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

/** Chart palette (distinct from Badge tones). */
const CHART_TONE: Record<string, "emerald" | "sky" | "amber" | "rose" | "violet" | "slate"> = {
  ACTIVE: "emerald",
  PROBATION: "sky",
  LEAVE: "amber",
  CONTRACT: "violet",
  CASUAL: "sky",
  TERMINATED: "slate",
};

const TASK_TONE: Record<string, "emerald" | "sky" | "amber" | "rose" | "slate"> = {
  COMPLETED: "emerald",
  IN_PROGRESS: "sky",
  NOT_STARTED: "slate",
  BLOCKED: "rose",
  WAIVED: "amber",
};

const TILES = [
  { label: "Employees", icon: "👥", href: "/hr/employees", desc: "Directory & records" },
  { label: "Onboarding", icon: "🚀", href: "/hr/onboarding/new-starters", desc: "New starters" },
  { label: "Leave", icon: "⏰", href: "/hr/leave/requests", desc: "Requests & balances" },
  { label: "Documents", icon: "📄", href: "/hr/documents", desc: "Files & expiry" },
  { label: "Policies", icon: "📜", href: "/hr/policies", desc: "Acknowledgements" },
  { label: "Certifications", icon: "🏅", href: "/hr/certifications", desc: "Compliance" },
  { label: "HR Reports", icon: "📊", href: "/hr/reports/employees", desc: "Insight & exports" },
  { label: "HR Settings", icon: "⚙️", href: "/hr/settings", desc: "Rules & preferences" },
];

export default async function HrDashboardPage() {
  const { organisationId, org } = await hrContext();
  const today = D(0);

  const [
    totalEmployees,
    newStarters,
    upcomingExits,
    pendingLeave,
    expiringCerts,
    pendingTasks,
    unreadNotifs,
    recentActivity,
    starters,
    leaveSoon,
    exiting,
    statusBreakdown,
    byDepartment,
    departments,
    leaveByType,
    taskBreakdown,
    dueSoonTasks,
  ] = await Promise.all([
    prisma.employee.count({ where: { organisationId } }),
    prisma.employee.count({ where: { organisationId, hireDate: { gte: D(-30) } } }),
    prisma.employee.count({
      where: { organisationId, terminationDate: { gte: today } },
    }),
    prisma.leaveRequest.count({ where: { organisationId, status: "PENDING" } }),
    prisma.employeeCertification.count({
      where: {
        employee: { organisationId },
        status: { in: ["EXPIRING", "EXPIRED"] },
      },
    }),
    prisma.onboardingTask.count({
      where: {
        organisationId,
        stage: "ONBOARDING",
        status: { in: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] },
      },
    }),
    prisma.orgNotification.count({ where: { organisationId, isRead: false } }),
    prisma.auditLog.findMany({
      where: { organisationId },
      orderBy: { createdAt: "desc" },
      take: 7,
    }),
    prisma.employee.findMany({
      where: { organisationId, hireDate: { gte: D(-45) } },
      orderBy: { hireDate: "desc" },
      take: 6,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        hireDate: true,
        employmentStatus: true,
        position: { select: { title: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        organisationId,
        status: "APPROVED",
        endDate: { gte: today },
        startDate: { lte: D(14) },
      },
      orderBy: { startDate: "asc" },
      take: 6,
      include: {
        employee: { select: { firstName: true, lastName: true } },
        leaveType: { select: { name: true, colour: true } },
      },
    }),
    prisma.employee.findMany({
      where: { organisationId, terminationDate: { gte: today } },
      orderBy: { terminationDate: "asc" },
      take: 6,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        terminationDate: true,
        terminationReason: true,
      },
    }),
    prisma.employee.groupBy({
      by: ["employmentStatus"],
      where: { organisationId },
      _count: true,
    }),
    prisma.employee.groupBy({
      by: ["departmentId"],
      where: { organisationId, departmentId: { not: null } },
      _count: true,
      orderBy: { _count: { departmentId: "desc" } },
      take: 8,
    }),
    prisma.department.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.leaveType.findMany({
      where: { organisationId, isActive: true },
      include: { _count: { select: { requests: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.onboardingTask.groupBy({
      by: ["status"],
      where: { organisationId, stage: "ONBOARDING" },
      _count: true,
    }),
    prisma.onboardingTask.findMany({
      where: {
        organisationId,
        status: { in: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] },
        dueDate: { lte: D(14) },
      },
      orderBy: { dueDate: "asc" },
      take: 6,
      include: { employee: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const attention = pendingLeave + expiringCerts + pendingTasks + upcomingExits;

  // ── chart data ──
  const statusSegments = statusBreakdown
    .map((s) => ({
      label: s.employmentStatus.replace("_", " "),
      value: s._count,
      tone: CHART_TONE[s.employmentStatus] ?? "slate",
    }))
    .sort((a, b) => b.value - a.value);

  const taskTotal = taskBreakdown.reduce((a, t) => a + t._count, 0);
  const taskSegments = taskBreakdown
    .map((t) => ({
      label: t.status.replace("_", " "),
      value: t._count,
      tone: TASK_TONE[t.status] ?? "slate",
    }))
    .sort((a, b) => b.value - a.value);
  const completedTasks = taskBreakdown.find((t) => t.status === "COMPLETED")?._count ?? 0;

  const leaveSegments = leaveByType
    .filter((t) => t._count.requests > 0)
    .map((t) => ({ label: t.name, value: t._count.requests, color: t.colour }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {formatDate(new Date())} · {org.name}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            HR Dashboard
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/hr/leave/approvals" className="btn-secondary">
            Review leave
          </Link>
          <Link href="/hr/employees/new" className="btn-primary">
            + Add employee
          </Link>
        </div>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total employees" value={totalEmployees} hint={org.name} tone="sky" />
        <StatCard label="New starters" value={newStarters} hint="Last 30 days" tone="emerald" />
        <StatCard label="Upcoming exits" value={upcomingExits} hint="Resignations & terminations" tone="rose" />
        <StatCard label="Pending leave" value={pendingLeave} hint="Awaiting approval" tone={pendingLeave ? "amber" : "emerald"} />
        <StatCard label="Expiring certifications" value={expiringCerts} hint="Expired or expiring" tone={expiringCerts ? "rose" : "emerald"} />
        <StatCard label="Pending HR tasks" value={pendingTasks} hint={`${unreadNotifs} unread notifications`} tone={pendingTasks ? "amber" : "emerald"} />
      </div>

      {/* ── Needs attention ── */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Needs your attention</h2>
          <Link href="/hr/tasks" className="text-xs text-sky-600 hover:underline">
            All tasks →
          </Link>
        </div>

        {attention === 0 ? (
          <div className="card grid place-items-center px-6 py-10 text-center">
            <div className="mb-2 text-2xl">✅</div>
            <p className="text-sm font-medium text-slate-700">Nothing needs your attention</p>
            <p className="mt-1 text-xs text-slate-500">
              Leave approvals, onboarding tasks and expiring certifications will surface here.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Leave requests", value: pendingLeave, href: "/hr/leave/approvals", icon: "⏰", tone: "amber" },
              { label: "Onboarding tasks", value: pendingTasks, href: "/hr/tasks", icon: "✅", tone: "sky" },
              { label: "Certifications", value: expiringCerts, href: "/hr/certifications/expiring", icon: "🏅", tone: "rose" },
              { label: "Upcoming exits", value: upcomingExits, href: "/hr/offboarding/leaving", icon: "👋", tone: "violet" },
            ].map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className={`card p-4 transition hover:shadow-md ${a.value === 0 ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{a.label}</span>
                  <span className="text-base">{a.icon}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span
                    className={`text-2xl font-semibold ${
                      a.value === 0
                        ? "text-slate-400"
                        : a.tone === "rose"
                        ? "text-rose-600"
                        : a.tone === "violet"
                        ? "text-violet-600"
                        : a.tone === "sky"
                        ? "text-sky-600"
                        : "text-amber-600"
                    }`}
                  >
                    {a.value}
                  </span>
                  {a.value > 0 && <span className="text-[11px] text-slate-400">open</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Visual breakdowns ── */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ChartPanel title="Workforce breakdown" subtitle="Employees by employment status">
          <Donut
            segments={statusSegments}
            size={132}
            thickness={16}
            centerValue={totalEmployees}
            centerLabel="people"
          />
        </ChartPanel>

        <ChartPanel title="Onboarding tasks" subtitle="Progress across current checklists">
          {taskTotal === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No onboarding tasks yet</p>
          ) : (
            <>
              <Donut
                segments={taskSegments}
                size={132}
                thickness={16}
                centerValue={`${Math.round((completedTasks / taskTotal) * 100)}%`}
                centerLabel="complete"
              />
              <div className="mt-3 border-t border-slate-100 pt-3">
                <ProgressBar
                  value={completedTasks}
                  max={taskTotal}
                  tone="emerald"
                  label="Tasks completed"
                />
              </div>
            </>
          )}
        </ChartPanel>

        <ChartPanel
          title="Headcount by department"
          subtitle="Where the team sits"
          action={
            <Link href="/hr/reports/headcount" className="text-[11px] text-sky-600 hover:underline">
              Report →
            </Link>
          }
        >
          <BarList
            items={byDepartment.map((d) => ({
              label: departments.find((x) => x.id === d.departmentId)?.name ?? "Unassigned",
              value: d._count,
              href: `/hr/employees?department=${d.departmentId}`,
            }))}
            valueFormat={(v) => String(v)}
          />
        </ChartPanel>

        <ChartPanel title="Leave requests by type" subtitle="All requests on record">
          <Donut
            segments={leaveSegments}
            size={132}
            thickness={16}
            centerValue={leaveByType.reduce((a, t) => a + t._count.requests, 0)}
            centerLabel="requests"
          />
        </ChartPanel>
      </div>

      {/* ── Quick links ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="card group p-3 text-center transition hover:border-sky-300 hover:shadow"
          >
            <div className="text-xl">{t.icon}</div>
            <div className="mt-1 text-xs font-semibold text-slate-700 group-hover:text-sky-700">
              {t.label}
            </div>
            <div className="mt-0.5 text-[10px] leading-tight text-slate-400">{t.desc}</div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* ── New starters ── */}
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Recent new starters</h2>
            <Link href="/hr/onboarding/new-starters" className="text-xs text-sky-600 hover:underline">
              Onboarding →
            </Link>
          </div>
          {starters.length === 0 ? (
            <EmptyState title="No new starters in the last 45 days" />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Role</th>
                  <th className="th">Started</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {starters.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <Link
                        href={`/hr/employees/${e.id}`}
                        className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                      >
                        {e.firstName} {e.lastName}
                      </Link>
                    </td>
                    <td className="td text-slate-600">{e.position?.title ?? "—"}</td>
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

        {/* ── Tasks due soon ── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Tasks due soon</h2>
            <Link href="/hr/tasks" className="text-xs text-sky-600 hover:underline">
              All →
            </Link>
          </div>
          <div className="card divide-y divide-slate-100">
            {dueSoonTasks.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No tasks due in 14 days</p>
            )}
            {dueSoonTasks.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-slate-800">{t.title}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {t.dueDate ? formatDate(t.dueDate) : "—"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t.employee ? `${t.employee.firstName} ${t.employee.lastName}` : "Unassigned"} ·{" "}
                  {t.status.replace("_", " ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* ── Upcoming leave ── */}
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Upcoming leave (next 14 days)</h2>
            <Link href="/hr/leave/requests" className="text-xs text-sky-600 hover:underline">
              Leave requests →
            </Link>
          </div>
          {leaveSoon.length === 0 ? (
            <EmptyState title="No approved leave upcoming" />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Type</th>
                  <th className="th">Dates</th>
                  <th className="th">Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaveSoon.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">
                      {l.employee.firstName} {l.employee.lastName}
                    </td>
                    <td className="td">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: `${l.leaveType.colour}1a`,
                          color: l.leaveType.colour,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: l.leaveType.colour }}
                        />
                        {l.leaveType.name}
                      </span>
                    </td>
                    <td className="td text-slate-500">
                      {formatDate(l.startDate)} → {formatDate(l.endDate)}
                    </td>
                    <td className="td text-slate-600">{String(l.days)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>

        {/* ── Upcoming exits ── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Upcoming exits</h2>
            <Link href="/hr/offboarding/leaving" className="text-xs text-sky-600 hover:underline">
              Offboarding →
            </Link>
          </div>
          <div className="card divide-y divide-slate-100">
            {exiting.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No exits scheduled</p>
            )}
            {exiting.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/hr/employees/${e.id}`}
                    className="text-[13px] font-medium text-slate-800 hover:text-sky-600 hover:underline"
                  >
                    {e.firstName} {e.lastName}
                  </Link>
                  <span className="shrink-0 text-[11px] text-rose-500">
                    {formatDate(e.terminationDate)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{e.terminationReason ?? "Exit"}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent activity ── */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Recent HR activity</h2>
        <div className="card divide-y divide-slate-100">
          {recentActivity.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No activity yet</p>
          )}
          {recentActivity.map((a) => (
            <div key={a.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <code className="text-[11px] font-medium text-slate-600">{a.action}</code>
                <span className="text-[11px] text-slate-400">{timeAgo(a.createdAt)}</span>
              </div>
              <p className="mt-0.5 text-xs leading-snug text-slate-600">{a.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
