import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, StatCard, TableWrap, PageHeader } from "@/components/ui";
import { ChartPanel, ColumnChart, type ColumnPoint } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";
import { STP_BADGE, stpState } from "@/app/payroll/stp/derive";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  PAID: "green",
  FAILED: "red",
};

export default async function PayRunReportPage() {
  const { organisationId, org } = await payrollContext();

  const runs = await prisma.payRun.findMany({
    where: { organisationId },
    orderBy: { payDate: "desc" },
    select: {
      id: true,
      label: true,
      periodStart: true,
      periodEnd: true,
      payDate: true,
      paidAt: true,
      status: true,
      employeeCount: true,
      grossPay: true,
      superAmount: true,
      taxAmount: true,
      netPay: true,
      _count: { select: { lines: true, payslips: true } },
    },
  });

  const totals = runs.reduce(
    (acc, r) => ({
      gross: acc.gross + Number(r.grossPay),
      super: acc.super + Number(r.superAmount),
      tax: acc.tax + Number(r.taxAmount),
      net: acc.net + Number(r.netPay),
      staff: acc.staff + r.employeeCount,
    }),
    { gross: 0, super: 0, tax: 0, net: 0, staff: 0 }
  );

  const chartRuns = [...runs].reverse();
  const headcountPoints: ColumnPoint[] = chartRuns.map((r) => ({
    label: r.label.replace(/^Pay run /, "#").split("—")[0].trim(),
    value: r.employeeCount,
  }));

  return (
    <div>
      <PageHeader
        title="Pay Run Reports"
        subtitle={`${org.name} · every pay run with totals and counts`}
        action={{ label: "Payroll summary", href: "/payroll/reports/summary" }}
      />

      {runs.length === 0 ? (
        <EmptyState
          title="No pay runs yet"
          hint="Create and calculate a pay run to populate this report."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Pay runs" value={runs.length} hint="All statuses" tone="amber" />
            <StatCard label="Employees costed" value={totals.staff} hint="Sum of run headcounts" tone="sky" />
            <StatCard label="Total gross" value={formatMoney(totals.gross)} hint="All runs" tone="indigo" />
            <StatCard label="Total net" value={formatMoney(totals.net)} hint="All runs" tone="emerald" />
          </div>

          <div className="mt-6">
            <ChartPanel title="Headcount per pay run" subtitle="Employees costed in each run">
              {headcountPoints.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No headcount data</p>
              ) : (
                <ColumnChart
                  points={headcountPoints}
                  tone="sky"
                  height={132}
                  valueFormat={(v) => `${v} staff`}
                />
              )}
            </ChartPanel>
          </div>

          <div className="mt-4">
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Pay run</th>
                  <th className="th">Period</th>
                  <th className="th">Pay date</th>
                  <th className="th">Status</th>
                  <th className="th">STP</th>
                  <th className="th text-right">Employees</th>
                  <th className="th text-right">Gross</th>
                  <th className="th text-right">Tax</th>
                  <th className="th text-right">Super</th>
                  <th className="th text-right">Net</th>
                  <th className="th text-right">Lines / slips</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => {
                  const stp = stpState(r);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="td">
                        <Link
                          href={`/payroll/pay-runs/${r.id}`}
                          className="font-medium text-slate-800 hover:text-amber-600 hover:underline"
                        >
                          {r.label}
                        </Link>
                      </td>
                      <td className="td whitespace-nowrap text-slate-500">
                        {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                      </td>
                      <td className="td whitespace-nowrap text-slate-500">{formatDate(r.payDate)}</td>
                      <td className="td">
                        <Badge tone={STATUS_BADGE[r.status] ?? "slate"}>
                          {r.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="td">
                        <Badge tone={STP_BADGE[stp.state]}>{stp.label}</Badge>
                      </td>
                      <td className="td text-right tabular-nums">{r.employeeCount}</td>
                      <td className="td text-right tabular-nums">{formatMoney(r.grossPay)}</td>
                      <td className="td text-right tabular-nums">{formatMoney(r.taxAmount)}</td>
                      <td className="td text-right tabular-nums">{formatMoney(r.superAmount)}</td>
                      <td className="td text-right font-medium tabular-nums text-slate-800">
                        {formatMoney(r.netPay)}
                      </td>
                      <td className="td text-right tabular-nums text-slate-500">
                        {r._count.lines} / {r._count.payslips}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="td font-semibold text-slate-800" colSpan={5}>
                    Totals
                  </td>
                  <td className="td text-right font-semibold tabular-nums text-slate-800">
                    {totals.staff}
                  </td>
                  <td className="td text-right font-semibold tabular-nums text-slate-800">
                    {formatMoney(totals.gross)}
                  </td>
                  <td className="td text-right font-semibold tabular-nums text-slate-800">
                    {formatMoney(totals.tax)}
                  </td>
                  <td className="td text-right font-semibold tabular-nums text-slate-800">
                    {formatMoney(totals.super)}
                  </td>
                  <td className="td text-right font-semibold tabular-nums text-slate-800">
                    {formatMoney(totals.net)}
                  </td>
                  <td className="td" />
                </tr>
              </tfoot>
            </TableWrap>
          </div>
        </>
      )}
    </div>
  );
}
