import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { BarList, ChartPanel, ColumnChart, Donut, ProgressBar } from "@/components/charts";
import { formatDate, timeAgo } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const OPEN_TASK: ("NOT_STARTED" | "IN_PROGRESS" | "BLOCKED")[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
];

export default async function EmployeeDashboardPage() {
  const { employee, organisationId, session, org } = await employeeContext();
  const today = D(0);
  const year = new Date().getFullYear();

  const [
    upcomingShifts,
    todayAttendance,
    openTasks,
    overdueTasks,
    balances,
    pendingLeave,
    notifications,
    recentAttendance,
    latestPayslip,
  ] = await Promise.all([
    prisma.shift.findMany({
      where: { employeeId: employee.id, date: { gte: today }, status: { not: "CANCELLED" } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 6,
      include: { location: { select: { name: true } } },
    }),
    prisma.attendanceRecord.findFirst({
      where: { employeeId: employee.id, date: today },
    }),
    prisma.onboardingTask.count({
      where: { employeeId: employee.id, status: { in: OPEN_TASK } },
    }),
    prisma.onboardingTask.count({
      where: { employeeId: employee.id, status: { in: OPEN_TASK }, dueDate: { lt: today } },
    }),
    prisma.leaveBalance.findMany({
      where: { employeeId: employee.id, year },
      include: { leaveType: { select: { name: true, colour: true } } },
    }),
    prisma.leaveRequest.count({
      where: { employeeId: employee.id, status: "PENDING" },
    }),
    prisma.orgNotification.findMany({
      where: { organisationId, OR: [{ userId: session.id }, { userId: null }] },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.attendanceRecord.findMany({
      where: { employeeId: employee.id, date: { gte: D(-13) } },
      orderBy: { date: "asc" },
      select: { date: true, workedMinutes: true, status: true },
    }),
    prisma.payslip.findFirst({
      where: { employeeId: employee.id },
      orderBy: { periodEnd: "desc" },
      include: { payRun: { select: { label: true, payDate: true } } },
    }),
  ]);

  const hoursWeek = recentAttendance
    .filter((a) => a.date >= D(-6))
    .reduce((acc, a) => acc + a.workedMinutes, 0) / 60;

  const balanceBars = balances
    .map((b) => {
      const entitled = Number(b.entitlement) + Number(b.carriedOver);
      const remaining = Math.max(0, entitled - Number(b.taken) - Number(b.pending));
      return {
        label: b.leaveType.name,
        value: Math.round(remaining * 10) / 10,
        color: b.leaveType.colour,
        hint: `${Number(b.taken).toFixed(1)} of ${entitled.toFixed(1)} days used`,
      };
    })
    .sort((a, b) => b.value - a.value);

  const attendanceColumns = recentAttendance.map((a) => ({
    label: new Date(a.date).toLocaleDateString("en-AU", { day: "2-digit" }),
    value: Math.round((a.workedMinutes / 60) * 10) / 10,
  }));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {formatDate(new Date())} · {org.name}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Hi {employee.firstName} 👋
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/employee/attendance" className="btn-secondary">
            🕒 Clock in / out
          </Link>
          <Link href="/employee/leave/new" className="btn-primary">
            + Apply for leave
          </Link>
        </div>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Next shift"
          value={upcomingShifts[0] ? formatDate(upcomingShifts[0].date) : "—"}
          hint={upcomingShifts[0] ? `${upcomingShifts[0].startTime}–${upcomingShifts[0].endTime}` : "Nothing scheduled"}
          tone="indigo"
        />
        <StatCard
          label="Today"
          value={todayAttendance ? todayAttendance.status : "Not clocked in"}
          hint={todayAttendance ? `${(todayAttendance.workedMinutes / 60).toFixed(1)}h worked` : "Clock in to start your day"}
          tone={todayAttendance ? "emerald" : "amber"}
        />
        <StatCard label="Hours (7 days)" value={hoursWeek.toFixed(1)} hint="From attendance records" tone="sky" />
        <StatCard
          label="My pending tasks"
          value={openTasks}
          hint={overdueTasks > 0 ? `${overdueTasks} overdue` : "On track"}
          tone={overdueTasks > 0 ? "rose" : openTasks ? "amber" : "emerald"}
        />
        <StatCard
          label="Leave pending"
          value={pendingLeave}
          hint={pendingLeave ? "Awaiting approval" : "No requests waiting"}
          tone={pendingLeave ? "amber" : "emerald"}
        />
      </div>

      {/* ── Charts ── */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartPanel title="My leave balance" subtitle={`Remaining days · ${year}`}>
          {balanceBars.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No balances recorded yet</p>
          ) : (
            <BarList items={balanceBars} valueFormat={(v) => `${v}d`} showPercents={false} />
          )}
        </ChartPanel>

        <ChartPanel
          title="Hours worked"
          subtitle="Last 14 days from attendance"
          action={
            <Link href="/employee/attendance/history" className="text-[11px] text-violet-600 hover:underline">
              History →
            </Link>
          }
        >
          {attendanceColumns.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No attendance recorded yet</p>
          ) : (
            <>
              <ColumnChart
                points={attendanceColumns}
                tone="violet"
                height={116}
                valueFormat={(v) => `${v}h`}
              />
              <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                {recentAttendance.reduce((a, r) => a + r.workedMinutes, 0) / 60 > 0
                  ? `${(recentAttendance.reduce((a, r) => a + r.workedMinutes, 0) / 60).toFixed(1)}h over the window`
                  : "No hours recorded in the window"}
              </div>
            </>
          )}
        </ChartPanel>

        <ChartPanel title="My balance mix" subtitle="Share of remaining leave">
          {balanceBars.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No balances recorded yet</p>
          ) : (
            <Donut
              segments={balanceBars.map((b) => ({
                label: b.label,
                value: b.value,
                color: b.color,
              }))}
              size={132}
              thickness={16}
              centerValue={String(Math.round(balanceBars.reduce((a, b) => a + b.value, 0)))}
              centerLabel="days left"
            />
          )}
        </ChartPanel>
      </div>

      {/* ── Quick tiles ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "My Schedule", icon: "📅", href: "/employee/roster" },
          { label: "Timesheets", icon: "⏱️", href: "/employee/timesheets" },
          { label: "Payslips", icon: "💰", href: "/employee/payslips" },
          { label: "Expenses", icon: "💳", href: "/employee/expenses" },
          { label: "Documents", icon: "📄", href: "/employee/documents" },
          { label: "My Profile", icon: "👤", href: "/employee/profile" },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="card group p-3 text-center transition hover:border-violet-300 hover:shadow"
          >
            <div className="text-xl">{t.icon}</div>
            <div className="mt-1 text-xs font-semibold text-slate-700 group-hover:text-violet-700">
              {t.label}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* ── Upcoming shifts ── */}
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">My upcoming shifts</h2>
            <Link href="/employee/roster" className="text-xs text-violet-600 hover:underline">
              Full schedule →
            </Link>
          </div>
          {upcomingShifts.length === 0 ? (
            <EmptyState title="No upcoming shifts" hint="Check back after the next roster is published." />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Time</th>
                  <th className="th">Location</th>
                  <th className="th">Hours</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcomingShifts.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="td whitespace-nowrap font-medium text-slate-800">
                      <Link href={`/employee/shifts/${s.id}`} className="hover:text-violet-600 hover:underline">
                        {formatDate(s.date)}
                      </Link>
                    </td>
                    <td className="td text-slate-600">
                      {s.startTime}–{s.endTime}
                      {s.breakMinutes > 0 && (
                        <span className="ml-1 text-[11px] text-slate-400">({s.breakMinutes}m break)</span>
                      )}
                    </td>
                    <td className="td text-slate-600">{s.location?.name ?? "—"}</td>
                    <td className="td text-slate-600">{Number(s.hours).toFixed(1)}</td>
                    <td className="td">
                      <Badge tone={s.status === "CONFIRMED" ? "green" : "blue"}>
                        {s.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>

        {/* ── Notifications + tasks ── */}
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Notifications</h2>
              <Link href="/employee/notifications" className="text-xs text-violet-600 hover:underline">
                All →
              </Link>
            </div>
            <div className="card divide-y divide-slate-100">
              {notifications.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing yet</p>
              )}
              {notifications.map((n) => (
                <div key={n.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-slate-800">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-slate-500">{n.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">My tasks</h2>
              <Link href="/employee/tasks" className="text-xs text-violet-600 hover:underline">
                All →
              </Link>
            </div>
            <div className="card p-4">
              {openTasks === 0 ? (
                <p className="text-sm text-slate-500">🎉 All tasks completed</p>
              ) : (
                <>
                  <ProgressBar
                    value={Math.max(0, 15 - openTasks)}
                    max={15}
                    tone={overdueTasks > 0 ? "rose" : "emerald"}
                    label={`${openTasks} open${overdueTasks > 0 ? ` · ${overdueTasks} overdue` : ""}`}
                  />
                  <Link href="/employee/tasks" className="btn-secondary mt-3 w-full !py-1.5 text-xs">
                    View my tasks
                  </Link>
                </>
              )}
            </div>
          </div>

          {latestPayslip && (
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Latest payslip
                </span>
                <Badge tone="green">{latestPayslip.status}</Badge>
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                ${Number(latestPayslip.netPay).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {latestPayslip.payRun.label} · net pay
              </div>
              <Link href="/employee/payslips" className="btn-secondary mt-3 w-full !py-1.5 text-xs">
                View payslips
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
