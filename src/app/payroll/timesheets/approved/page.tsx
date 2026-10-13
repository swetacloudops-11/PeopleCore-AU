import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, ColumnChart, type ColumnPoint } from "@/components/charts";
import { formatDate } from "@/lib/format";

export default async function ApprovedTimesheetsPage() {
  const { organisationId, org } = await payrollContext();

  const timesheets = await prisma.timesheet.findMany({
    where: { organisationId, status: "APPROVED" },
    orderBy: [{ periodStart: "desc" }, { approvedAt: "desc" }],
    include: {
      employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
      approvedBy: { select: { name: true } },
    },
  });

  const totalHours = timesheets.reduce((a, t) => a + Number(t.totalHours), 0);
  const overtimeHours = timesheets.reduce((a, t) => a + Number(t.overtimeHours), 0);
  const employeesCovered = new Set(timesheets.map((t) => t.employee.employeeNumber)).size;

  const byPeriod = new Map<string, number>();
  for (const t of timesheets) {
    const label = formatDate(t.periodStart);
    byPeriod.set(label, (byPeriod.get(label) ?? 0) + Number(t.totalHours));
  }
  const columnPoints = [...byPeriod.entries()].map(
    ([label, value]): ColumnPoint => ({ label, value: Math.round(value * 100) / 100 })
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Approved timesheets
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · {timesheets.length} approved and ready for payroll
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/payroll/timesheets" className="btn-secondary">
            All timesheets
          </Link>
          <Link href="/payroll/timesheets/pending" className="btn-secondary">
            Pending
          </Link>
        </div>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Approved" value={timesheets.length} hint="Ready for payroll" tone="emerald" />
        <StatCard label="Total hours" value={totalHours.toFixed(2)} hint="Across approved sheets" tone="amber" />
        <StatCard label="Overtime hours" value={overtimeHours.toFixed(2)} hint="Included above" tone="indigo" />
        <StatCard label="Employees" value={employeesCovered} hint="With approved hours" tone="sky" />
      </div>

      {/* ── Approved hours by period ── */}
      <div className="mt-5">
        <ChartPanel title="Approved hours by period" subtitle="Total approved hours per pay period">
          {columnPoints.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No approved timesheets yet</p>
          ) : (
            <ColumnChart
              points={columnPoints}
              tone="amber"
              height={140}
              valueFormat={(v) => `${v.toFixed(2)} h`}
            />
          )}
        </ChartPanel>
      </div>

      {/* ── Table ── */}
      <div className="mt-6">
        {timesheets.length === 0 ? (
          <EmptyState
            title="No approved timesheets yet"
            hint="Approved timesheets will be listed here with their approver and hours."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Period</th>
                <th className="th text-right">Hours</th>
                <th className="th text-right">Overtime</th>
                <th className="th">Approved</th>
                <th className="th">Approved by</th>
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
                    {t.approvedAt ? formatDate(t.approvedAt) : "—"}
                  </td>
                  <td className="td text-slate-600">{t.approvedBy?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
