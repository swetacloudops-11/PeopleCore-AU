import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { BarList, ChartPanel, ColumnChart, Donut, ProgressBar } from "@/components/charts";
import { formatDate, formatMoney, timeAgo } from "@/lib/format";

/** Status → badge tone (Badge tones). */
const STATUS_BADGE: Record<string, string> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  PAID: "green",
  FAILED: "red",
};

/** Status → chart tone. */
const STATUS_CHART: Record<string, "slate" | "amber" | "sky" | "emerald" | "rose"> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "sky",
  PAID: "emerald",
  FAILED: "rose",
};

export default async function PayrollDashboardPage() {
  const { organisationId, org } = await payrollContext();

  const [
    payrollEmployees,
    runs,
    runStatusGroups,
    pendingTimesheets,
    approvedTimesheets,
    payments,
    schedules,
    latestPaidRun,
    ytd,
    runTrend,
    recentNotifications,
    missingDetails,
    latestRun,
  ] = await Promise.all([
    prisma.employee.count({
      where: { organisationId, employmentStatus: { not: "TERMINATED" } },
    }),
    prisma.payRun.findMany({
      where: { organisationId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } },
      orderBy: { payDate: "asc" },
      take: 6,
      select: {
        id: true, label: true, payDate: true, status: true, employeeCount: true,
        grossPay: true, netPay: true, _count: { select: { lines: true, payslips: true } },
      },
    }),
    prisma.payRun.groupBy({ by: ["status"], where: { organisationId }, _count: true }),
    prisma.timesheet.count({ where: { organisationId, status: "SUBMITTED" } }),
    prisma.timesheet.count({ where: { organisationId, status: "APPROVED" } }),
    prisma.payslip.count({ where: { organisationId, status: "PENDING" } }),
    prisma.paySchedule.findMany({
      where: { organisationId, isActive: true },
      orderBy: { nextRunDate: "asc" },
      select: { id: true, name: true, frequency: true, payDay: true, nextRunDate: true },
    }),
    prisma.payRun.findFirst({
      where: { organisationId, status: "PAID" },
      orderBy: { payDate: "desc" },
    }),
    prisma.payslip.aggregate({
      where: { organisationId, periodEnd: { gte: new Date(`${new Date().getFullYear()}-01-01`) } },
      _sum: { grossPay: true, netPay: true, taxAmount: true, superAmount: true },
      _count: true,
    }),
    prisma.payRun.findMany({
      where: { organisationId, status: { in: ["PAID", "APPROVED"] } },
      orderBy: { payDate: "asc" },
      take: 8,
      select: { label: true, payDate: true, grossPay: true },
    }),
    prisma.orgNotification.findMany({
      where: { organisationId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, title: true, body: true, createdAt: true, isRead: true },
    }),
    prisma.employee.count({
      where: {
        organisationId,
        employmentStatus: { not: "TERMINATED" },
        OR: [{ superFundName: null }, { baseSalary: 0, hourlyRate: 0 }],
      },
    }),
    prisma.payRun.findFirst({
      where: { organisationId, lines: { some: {} } },
      orderBy: [{ payDate: "desc" }, { createdAt: "desc" }],
      select: { id: true, label: true },
    }),
  ]);

  // Only the most recent run that actually has calculated lines: the same
  // employee appears once per run, so scanning every run repeats their name.
  const latestRunLines = latestRun
    ? await prisma.payRunLine.findMany({
        where: { payRunId: latestRun.id },
        orderBy: { grossPay: "desc" },
        take: 8,
        select: {
          grossPay: true,
          hoursWorked: true,
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        },
      })
    : [];

  const needsAction =
    runs.filter((r) => r.status === "PENDING_APPROVAL").length +
    runs.filter((r) => r.status === "APPROVED").length +
    pendingTimesheets;

  const statusSegments = runStatusGroups.map((s) => ({
    label: s.status.replace(/_/g, " "),
    value: s._count,
    tone: STATUS_CHART[s.status] ?? ("slate" as const),
  }));

  const trendPoints = runTrend.map((r) => ({
    label: r.label.replace(/^Pay run /, "#").split("—")[0].trim(),
    value: Number(r.grossPay),
  }));

  const topEarners = latestRunLines
    .filter((l) => Number(l.grossPay) > 0)
    .map((l) => ({
      label: `${l.employee.firstName} ${l.employee.lastName}`,
      value: Math.round(Number(l.grossPay)),
      hint: `${Number(l.hoursWorked).toFixed(1)}h · ${l.employee.employeeNumber}`,
    }));

  const ytdGross = Number(ytd._sum.grossPay ?? 0);
  const ytdTax = Number(ytd._sum.taxAmount ?? 0);
  const ytdSuper = Number(ytd._sum.superAmount ?? 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {formatDate(new Date())} · {org.name}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Payroll Dashboard
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/payroll/approve" className="btn-secondary">
            Review approvals
          </Link>
          <Link href="/payroll/pay-runs/new" className="btn-primary">
            + Create pay run
          </Link>
        </div>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Employees for payroll" value={payrollEmployees} hint="Active records" tone="amber" />
        <StatCard
          label="Upcoming pay runs"
          value={runs.length}
          hint={runs[0] ? `Next: ${runs[0].label}` : "None scheduled"}
          tone="indigo"
        />
        <StatCard
          label="Pending timesheets"
          value={pendingTimesheets}
          hint={`${approvedTimesheets} approved`}
          tone={pendingTimesheets ? "amber" : "emerald"}
        />
        <StatCard
          label="Payroll warnings"
          value={missingDetails}
          hint="Missing pay/super details"
          tone={missingDetails ? "rose" : "emerald"}
        />
        <StatCard
          label="Pending approvals"
          value={runs.filter((r) => r.status === "PENDING_APPROVAL").length}
          hint="Pay runs awaiting approval"
          tone={runs.some((r) => r.status === "PENDING_APPROVAL") ? "amber" : "emerald"}
        />
        <StatCard
          label="Payslips to issue"
          value={payments}
          hint="Generated, not yet issued"
          tone={payments ? "amber" : "emerald"}
        />
      </div>

      {/* ── Needs attention ── */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Needs your action</h2>
          <Link href="/payroll/pay-runs" className="text-xs text-amber-600 hover:underline">
            All pay runs →
          </Link>
        </div>

        {needsAction === 0 ? (
          <div className="card grid place-items-center px-6 py-10 text-center">
            <div className="mb-2 text-2xl">✅</div>
            <p className="text-sm font-medium text-slate-700">Nothing needs your attention</p>
            <p className="mt-1 text-xs text-slate-500">
              Draft runs, timesheet approvals and payroll exceptions will surface here.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Calculate payroll", value: runs.filter((r) => r.status === "DRAFT").length, href: "/payroll/calculate", icon: "🧮", tone: "slate" },
              { label: "Review & approve", value: runs.filter((r) => r.status === "PENDING_APPROVAL").length, href: "/payroll/approve", icon: "✅", tone: "amber" },
              { label: "Finalise payroll", value: runs.filter((r) => r.status === "APPROVED").length, href: "/payroll/finalise", icon: "📤", tone: "sky" },
              { label: "Timesheets to approve", value: pendingTimesheets, href: "/payroll/timesheets/pending", icon: "⏱️", tone: "amber" },
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
                        : a.tone === "amber"
                        ? "text-amber-600"
                        : a.tone === "sky"
                        ? "text-sky-600"
                        : "text-slate-700"
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
        <ChartPanel title="Pay runs by status" subtitle="All runs on record">
          <Donut
            segments={statusSegments}
            size={132}
            thickness={16}
            centerValue={runStatusGroups.reduce((a, s) => a + s._count, 0)}
            centerLabel="runs"
          />
        </ChartPanel>

        <ChartPanel
          title="Gross pay trend"
          subtitle="Last completed runs"
          action={
            <Link href="/payroll/reports/summary" className="text-[11px] text-amber-600 hover:underline">
              Report →
            </Link>
          }
        >
          {trendPoints.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No completed runs yet</p>
          ) : (
            <ColumnChart
              points={trendPoints}
              tone="amber"
              height={120}
              valueFormat={(v) => `$${Math.round(v / 1000)}k`}
            />
          )}
        </ChartPanel>

        <ChartPanel
          title="Top earners this cycle"
          subtitle={
            latestRun ? `Highest gross · ${latestRun.label}` : "Highest gross in the latest run"
          }
          action={
            <Link href="/payroll/employees/salary" className="text-[11px] text-amber-600 hover:underline">
              Salaries →
            </Link>
          }
        >
          <BarList items={topEarners} valueFormat={(v) => formatMoney(v)} showPercents={false} />
        </ChartPanel>

        <ChartPanel title="Year to date" subtitle={`${new Date().getFullYear()} payslips`}>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Gross</dt>
              <dd className="font-semibold text-slate-900">{formatMoney(ytdGross)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">PAYG withheld</dt>
              <dd className="font-semibold text-slate-900">{formatMoney(ytdTax)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Superannuation</dt>
              <dd className="font-semibold text-slate-900">{formatMoney(ytdSuper)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <dt className="text-slate-500">Payslips</dt>
              <dd className="font-semibold text-slate-900">{ytd._count}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <ProgressBar
              value={ytdTax + ytdSuper}
              max={ytdGross || 1}
              tone="amber"
              label="Tax + super share of gross"
            />
          </div>
        </ChartPanel>
      </div>

      {/* ── Upcoming pay runs ── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Upcoming & in-progress pay runs</h2>
            <Link href="/payroll/pay-runs" className="text-xs text-amber-600 hover:underline">
              Manage →
            </Link>
          </div>
          {runs.length === 0 ? (
            <EmptyState title="No open pay runs" hint="Create a pay run to get started." />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Pay run</th>
                  <th className="th">Pay date</th>
                  <th className="th">Status</th>
                  <th className="th">Employees</th>
                  <th className="th">Gross</th>
                  <th className="th">Lines / slips</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <Link
                        href={`/payroll/pay-runs/${r.id}`}
                        className="font-medium text-slate-800 hover:text-amber-600 hover:underline"
                      >
                        {r.label}
                      </Link>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDate(r.payDate)}</td>
                    <td className="td">
                      <Badge tone={STATUS_BADGE[r.status] ?? "slate"}>
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="td text-slate-600">{r.employeeCount}</td>
                    <td className="td tabular-nums text-slate-600">{formatMoney(Number(r.grossPay))}</td>
                    <td className="td text-slate-500">
                      {r._count.lines} / {r._count.payslips}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}

          {schedules.length > 0 && (
            <div className="mt-4 card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Active pay schedules
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                {schedules.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">{s.name}</span>
                    <span className="text-slate-500">
                      {s.frequency.charAt(0) + s.frequency.slice(1).toLowerCase()} ·{" "}
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.payDay] ?? "—"}
                      {s.nextRunDate ? ` · next ${formatDate(s.nextRunDate)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Summary + notifications ── */}
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-800">Payroll summary</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Last paid run</dt>
                <dd className="text-right font-medium text-slate-800">
                  {latestPaidRun ? (
                    <>
                      {latestPaidRun.label}
                      <div className="text-xs font-normal text-slate-500">
                        {formatMoney(Number(latestPaidRun.netPay))} net ·{" "}
                        {latestPaidRun.employeeCount} staff
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                <dt className="text-slate-500">Open pay runs</dt>
                <dd className="font-medium text-slate-800">{runs.length}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Payslips this year</dt>
                <dd className="font-medium text-slate-800">{ytd._count}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Super rate</dt>
                <dd className="font-medium text-slate-800">11.5%</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/payroll/stp" className="btn-secondary !py-1.5 text-xs">
                STP reports
              </Link>
              <Link href="/payroll/reports/pay-run" className="btn-secondary !py-1.5 text-xs">
                Pay run reports
              </Link>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Payroll notifications</h2>
              <Link href="/payroll/notifications/reminders" className="text-xs text-amber-600 hover:underline">
                All →
              </Link>
            </div>
            <div className="card divide-y divide-slate-100">
              {recentNotifications.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing yet</p>
              )}
              {recentNotifications.map((n) => (
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
        </div>
      </div>
    </div>
  );
}
