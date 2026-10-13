import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, BarList, type BarItem } from "@/components/charts";
import { formatDate } from "@/lib/format";
import { TimesheetActions } from "../TimesheetActions";

export default async function PendingTimesheetsPage() {
  const { organisationId, org } = await payrollContext();

  const timesheets = await prisma.timesheet.findMany({
    where: { organisationId, status: "SUBMITTED" },
    orderBy: [{ submittedAt: "asc" }, { periodStart: "asc" }],
    include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
  });

  const totalHours = timesheets.reduce((a, t) => a + Number(t.totalHours), 0);
  const employeesAffected = new Set(timesheets.map((t) => t.employee.employeeNumber)).size;

  // Hours awaiting approval, grouped by employee (top 8 by hours).
  const byEmployee = new Map<string, { name: string; hours: number; count: number }>();
  for (const t of timesheets) {
    const key = t.employee.employeeNumber;
    const entry = byEmployee.get(key) ?? {
      name: `${t.employee.firstName} ${t.employee.lastName}`,
      hours: 0,
      count: 0,
    };
    entry.hours += Number(t.totalHours);
    entry.count += 1;
    byEmployee.set(key, entry);
  }
  const topEmployees = [...byEmployee.values()]
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8)
    .map(
      (e): BarItem => ({
        label: e.name,
        value: Math.round(e.hours * 100) / 100,
        hint: `${e.count} timesheet${e.count === 1 ? "" : "s"}`,
      })
    );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Pending timesheets
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · {timesheets.length} awaiting approval
          </p>
        </div>
        <Link href="/payroll/timesheets" className="btn-secondary">
          All timesheets
        </Link>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Pending"
          value={timesheets.length}
          hint="Submitted timesheets"
          tone={timesheets.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Total hours"
          value={totalHours.toFixed(2)}
          hint="Awaiting approval"
          tone="indigo"
        />
        <StatCard
          label="Employees affected"
          value={employeesAffected}
          hint="With hours to approve"
          tone="sky"
        />
      </div>

      {/* ── Hours by employee ── */}
      <div className="mt-5">
        <ChartPanel
          title="Hours by employee"
          subtitle="Top 8 employees with hours awaiting approval"
        >
          <BarList
            items={topEmployees}
            tone="amber"
            valueFormat={(v) => `${v.toFixed(2)} h`}
            showPercents={false}
          />
        </ChartPanel>
      </div>

      {/* ── Table ── */}
      <div className="mt-6">
        {timesheets.length === 0 ? (
          <EmptyState
            title="Nothing to approve"
            hint="There are no submitted timesheets waiting on a decision."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Period</th>
                <th className="th text-right">Hours</th>
                <th className="th text-right">Overtime</th>
                <th className="th">Submitted</th>
                <th className="th text-right">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timesheets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <span className="font-medium text-slate-800">
                      {t.employee.firstName} {t.employee.lastName}
                    </span>
                    <div className="text-[11px] text-slate-400">{t.employee.employeeNumber}</div>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDate(t.periodStart)} → {formatDate(t.periodEnd)}
                  </td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {Number(t.totalHours).toFixed(2)}
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {Number(t.overtimeHours).toFixed(2)}
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {t.submittedAt ? formatDate(t.submittedAt) : "—"}
                  </td>
                  <td className="td">
                    <TimesheetActions
                      timesheet={{
                        id: t.id,
                        label: `${t.employee.firstName} ${t.employee.lastName} · ${formatDate(
                          t.periodStart
                        )} → ${formatDate(t.periodEnd)}`,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
