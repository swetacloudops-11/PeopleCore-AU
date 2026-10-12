import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, ColumnChart, Donut } from "@/components/charts";
import { formatDate, formatMoney, timeAgo } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const TILES = [
  { label: "People", icon: "👥", href: "/org/people", desc: "Employees, teams, org units" },
  { label: "Time & Attendance", icon: "⏰", href: "/org/time/attendance", desc: "Timesheets and leave" },
  { label: "Rostering", icon: "📅", href: "/org/roster", desc: "Shifts, swaps, conflicts" },
  { label: "Payroll", icon: "💰", href: "/org/payroll/pay-runs", desc: "Pay runs and payslips" },
  { label: "Expenses", icon: "💳", href: "/org/expenses", desc: "Claims and approvals" },
  { label: "Onboarding", icon: "🚀", href: "/org/onboarding/new-starters", desc: "Checklists and tasks" },
  { label: "Performance", icon: "📈", href: "/org/performance", desc: "Reviews, goals, feedback" },
  { label: "Reports", icon: "📊", href: "/org/reports/employees", desc: "People and payroll insight" },
];

export default async function OrgDashboardPage() {
  const { organisationId, org } = await orgContext();
  const today = D(0);

  const [
    totalEmployees,
    activeEmployees,
    newStarters,
    pendingTimesheets,
    pendingLeave,
    pendingExpenses,
    upcomingPayroll,
    openConflicts,
    expiringCerts,
    overdueReviews,
    unreadNotifs,
    recentActivity,
    leaveSoon,
    statusBreakdown,
    payTrend,
    leaveByType,
    attendanceByDay,
  ] = await Promise.all([
    prisma.employee.count({ where: { organisationId } }),
    prisma.employee.count({
      where: { organisationId, employmentStatus: { in: ["ACTIVE", "PROBATION", "LEAVE"] } },
    }),
    prisma.employee.count({
      where: { organisationId, hireDate: { gte: D(-30) } },
    }),
    prisma.timesheet.count({
      where: { organisationId, status: "SUBMITTED" },
    }),
    prisma.leaveRequest.count({ where: { organisationId, status: "PENDING" } }),
    prisma.expense.count({ where: { organisationId, status: "PENDING" } }),
    prisma.payRun.findFirst({
      where: { organisationId, status: { in: ["PENDING_APPROVAL", "DRAFT", "APPROVED"] } },
      orderBy: { payDate: "asc" },
      include: { _count: { select: { lines: true } } },
    }),
    prisma.rosterConflict.count({
      where: { organisationId, resolved: false, severity: { in: ["ERROR", "WARNING"] } },
    }),
    prisma.employeeCertification.count({
      where: {
        employee: { organisationId },
        status: { in: ["EXPIRING", "EXPIRED"] },
      },
    }),
    prisma.review.count({
      where: { organisationId, status: { in: ["DRAFT", "IN_PROGRESS"] } },
    }),
    prisma.orgNotification.count({
      where: { organisationId, isRead: false },
    }),
    prisma.auditLog.findMany({
      where: { organisationId },
      orderBy: { createdAt: "desc" },
      take: 7,
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
    prisma.employee.groupBy({
      by: ["employmentStatus"],
      where: { organisationId },
      _count: true,
    }),
    prisma.payRun.findMany({
      where: { organisationId, status: { in: ["APPROVED", "PAID"] } },
      orderBy: { payDate: "asc" },
      take: 8,
      select: { payDate: true, grossPay: true, label: true },
    }),
    prisma.leaveType.findMany({
      where: { organisationId, isActive: true },
      include: { _count: { select: { requests: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["date"],
      where: { organisationId, date: { gte: D(-13) } },
      _count: true,
      orderBy: { date: "asc" },
    }),
  ]);

  const approvals =
    pendingTimesheets + pendingLeave + pendingExpenses + openConflicts + overdueReviews;

  // ── chart data ──
  const STATUS_TONE: Record<string, "emerald" | "sky" | "amber" | "rose" | "violet" | "slate"> = {
    ACTIVE: "emerald",
    PROBATION: "sky",
    LEAVE: "amber",
    CONTRACT: "violet",
    CASUAL: "indigo" as never,
    TERMINATED: "slate",
  };

  const statusSegments = statusBreakdown
    .map((s) => ({
      label: s.employmentStatus.replace("_", " "),
      value: s._count,
      tone: (STATUS_TONE[s.employmentStatus] ?? "slate") as "slate",
    }))
    .sort((a, b) => b.value - a.value);

  const payrollColumns = payTrend.map((r) => ({
    label: r.payDate.toLocaleDateString("en-AU", { day: "2-digit", month: "short" }),
    value: Number(r.grossPay),
  }));

  const leaveSegments = leaveByType
    .filter((t) => t._count.requests > 0)
    .map((t) => ({ label: t.name, value: t._count.requests, color: t.colour }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const attendanceColumns = attendanceByDay.map((a) => ({
    label: new Date(a.date).toLocaleDateString("en-AU", { day: "2-digit" }),
    value: a._count,
  }));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {formatDate(new Date())} · {org.name}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Dashboard
          </h1>
        </div>
        <Link href="/org/roster/create" className="btn-primary">
          + Create shift
        </Link>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total employees" value={totalEmployees} hint={`${org.industry ?? "Organisation"}`} tone="indigo" />
        <StatCard label="Active employees" value={activeEmployees} hint={`${totalEmployees - activeEmployees} inactive`} tone="emerald" />
        <StatCard label="New starters" value={newStarters} hint="Last 30 days" tone="sky" />
        <StatCard label="Pending approvals" value={approvals} hint="Needs your action" tone={approvals ? "amber" : "emerald"} />
        <StatCard
          label="Upcoming payroll"
          value={upcomingPayroll ? formatMoney(upcomingPayroll.netPay) : "—"}
          hint={
            upcomingPayroll
              ? `${upcomingPayroll.label} · ${upcomingPayroll._count.lines || upcomingPayroll.employeeCount} staff`
              : "No run scheduled"
          }
          tone="indigo"
        />
        <StatCard label="Alerts & exceptions" value={openConflicts + expiringCerts} hint={`${unreadNotifs} notifications`} tone={openConflicts + expiringCerts ? "rose" : "emerald"} />
      </div>

      {/* ── Alerts & exceptions ── */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Alerts &amp; exceptions</h2>
          <Link href="/org/roster/conflicts" className="text-xs text-indigo-600 hover:underline">
            View all →
          </Link>
        </div>

        {approvals === 0 && openConflicts === 0 ? (
          <div className="card grid place-items-center px-6 py-10 text-center">
            <div className="mb-2 text-2xl">✅</div>
            <p className="text-sm font-medium text-slate-700">Nothing needs your attention</p>
            <p className="mt-1 text-xs text-slate-500">
              Approvals, roster conflicts and expiring certifications will surface here.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {[
              { label: "Timesheets to approve", value: pendingTimesheets, href: "/org/time/timesheets?status=SUBMITTED", icon: "⏰", tone: "amber" },
              { label: "Leave requests", value: pendingLeave, href: "/org/time/leave?status=PENDING", icon: "🌴", tone: "amber" },
              { label: "Expenses to approve", value: pendingExpenses, href: "/org/expenses/approvals", icon: "💳", tone: "amber" },
              { label: "Roster conflicts", value: openConflicts, href: "/org/roster/conflicts", icon: "⚠️", tone: "rose" },
              { label: "Reviews in progress", value: overdueReviews, href: "/org/performance/reviews", icon: "📈", tone: "sky" },
            ].map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className={`card p-4 transition hover:shadow-md ${
                  a.value === 0 ? "opacity-60" : ""
                }`}
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
                        : a.tone === "sky"
                        ? "text-sky-600"
                        : "text-amber-600"
                    }`}
                  >
                    {a.value}
                  </span>
                  {a.value > 0 && <span className="text-[11px] text-slate-400">pending</span>}
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

        <ChartPanel
          title="Payroll trend"
          subtitle="Gross pay across the last runs"
          action={
            <Link href="/org/payroll/reports" className="text-[11px] text-indigo-600 hover:underline">
              Reports →
            </Link>
          }
        >
          {payrollColumns.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No completed pay runs yet</p>
          ) : (
            <>
              <ColumnChart
                points={payrollColumns}
                tone="emerald"
                height={116}
                valueFormat={(v) => `$${Math.round(v / 1000)}k`}
              />
              <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                Latest run{" "}
                <span className="font-semibold text-slate-800">
                  {formatMoney(payrollColumns[payrollColumns.length - 1].value)}
                </span>
              </div>
            </>
          )}
        </ChartPanel>

        <ChartPanel title="Leave requests by type" subtitle="All requests this leave year">
          <Donut
            segments={leaveSegments}
            size={132}
            thickness={16}
            centerValue={leaveByType.reduce((a, t) => a + t._count.requests, 0)}
            centerLabel="requests"
          />
        </ChartPanel>

        <ChartPanel
          title="Attendance volume"
          subtitle="Records logged over 14 days"
          action={
            <Link href="/org/time/attendance" className="text-[11px] text-indigo-600 hover:underline">
              View →
            </Link>
          }
        >
          {attendanceColumns.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No attendance recorded yet</p>
          ) : (
            <>
              <ColumnChart
                points={attendanceColumns}
                tone="sky"
                height={116}
                valueFormat={(v) => String(v)}
              />
              <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                {attendanceColumns.reduce((a, p) => a + p.value, 0)} records in the window
              </div>
            </>
          )}
        </ChartPanel>
      </div>

      {/* ── Quick links ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="card group p-3 text-center transition hover:border-emerald-300 hover:shadow"
          >
            <div className="text-xl">{t.icon}</div>
            <div className="mt-1 text-xs font-semibold text-slate-700 group-hover:text-emerald-700">
              {t.label}
            </div>
            <div className="mt-0.5 text-[10px] leading-tight text-slate-400">{t.desc}</div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* ── Upcoming leave ── */}
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Upcoming leave (next 14 days)
            </h2>
            <Link href="/org/time/leave" className="text-xs text-indigo-600 hover:underline">
              Leave management →
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

        {/* ── Recent activity ── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Recent activity</h2>
            <Link href="/org/reports/employees" className="text-xs text-indigo-600 hover:underline">
              Reports →
            </Link>
          </div>
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
        </div>
      </div>

      {/* ── Expiring certifications strip ── */}
      {expiringCerts > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Certifications needing attention
            </h2>
            <Link
              href="/org/people/certifications"
              className="text-xs text-indigo-600 hover:underline"
            >
              Manage →
            </Link>
          </div>
          <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
            <Badge tone="red">{expiringCerts} EXPIRED OR EXPIRING</Badge>
            <span className="text-sm text-slate-600">
              Renew these before the next roster is published to stay compliant.
            </span>
            <Link href="/org/people/certifications" className="btn-secondary ml-auto !py-1.5 text-xs">
              Review now
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
