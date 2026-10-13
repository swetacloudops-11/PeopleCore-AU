import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs, intParam } from "@/lib/payroll";
import { EmptyState, StatCard, TableWrap, PageHeader } from "@/components/ui";
import { ChartPanel, ColumnChart, type ColumnPoint } from "@/components/charts";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { stpState } from "../derive";

export const dynamic = "force-dynamic";

const PAGE = 20;

export default async function StpHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();
  const page = intParam(sp.page, 1);

  const [total, runs, chartRuns] = await Promise.all([
    prisma.payRun.count({ where: { organisationId, status: "PAID" } }),
    prisma.payRun.findMany({
      where: { organisationId, status: "PAID" },
      orderBy: { payDate: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
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
        taxAmount: true,
        superAmount: true,
        netPay: true,
      },
    }),
    prisma.payRun.findMany({
      where: { organisationId, status: "PAID" },
      orderBy: { periodStart: "asc" },
      select: { id: true, label: true, periodStart: true, grossPay: true },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const totalGross = chartRuns.reduce((a, r) => a + Number(r.grossPay), 0);

  const points: ColumnPoint[] = chartRuns.map((r) => ({
    label: formatDate(r.periodStart),
    value: Math.round(Number(r.grossPay)),
  }));

  return (
    <div>
      <PageHeader
        title="Submission History"
        subtitle={`${org.name} · accepted STP lodgements`}
        action={{ label: "Submission status", href: "/payroll/stp/status" }}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Accepted submissions" value={total} hint="Paid pay runs" tone="emerald" />
        <StatCard label="Total lodged gross" value={formatMoney(totalGross)} hint="Across all submissions" tone="amber" />
        <StatCard
          label="Latest lodgement"
          value={chartRuns.length > 0 ? formatDate(chartRuns[chartRuns.length - 1].periodStart) : "—"}
          hint="Most recent period"
          tone="sky"
        />
      </div>

      {total === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No STP submissions yet"
            hint="Finalise a pay run to lodge it with the ATO — accepted submissions appear here."
          />
        </div>
      ) : (
        <>
          <div className="mt-6">
            <ChartPanel title="Lodged gross by period" subtitle="Gross pay reported with each submission">
              {points.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No submissions</p>
              ) : (
                <ColumnChart
                  points={points}
                  tone="emerald"
                  height={132}
                  valueFormat={(v) => `$${Math.round(v / 1000)}k`}
                />
              )}
            </ChartPanel>
          </div>

          <div className="mt-4">
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">Pay run</th>
                  <th className="th">Period</th>
                  <th className="th">Lodged</th>
                  <th className="th text-right">Employees</th>
                  <th className="th text-right">Gross</th>
                  <th className="th text-right">Tax withheld</th>
                  <th className="th text-right">Super</th>
                  <th className="th text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => {
                  const stp = stpState(r);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="td">
                        <span className="font-mono text-[12px] font-medium text-slate-800">
                          {stp.reference}
                        </span>
                      </td>
                      <td className="td">
                        <Link
                          href={`/payroll/pay-runs/${r.id}`}
                          className="text-slate-600 hover:text-amber-600 hover:underline"
                        >
                          {r.label}
                        </Link>
                      </td>
                      <td className="td whitespace-nowrap text-slate-500">
                        {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                      </td>
                      <td className="td whitespace-nowrap text-slate-500">
                        {stp.lodgedAt ? formatDateTime(stp.lodgedAt) : "—"}
                      </td>
                      <td className="td text-right tabular-nums">{r.employeeCount}</td>
                      <td className="td text-right tabular-nums">{formatMoney(r.grossPay)}</td>
                      <td className="td text-right tabular-nums">{formatMoney(r.taxAmount)}</td>
                      <td className="td text-right tabular-nums">{formatMoney(r.superAmount)}</td>
                      <td className="td text-right font-medium tabular-nums text-slate-800">
                        {formatMoney(r.netPay)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          </div>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
              <span>
                Page {page} of {pages} · {total} submissions
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={qs({ page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                    ← Previous
                  </Link>
                )}
                {page < pages && (
                  <Link href={qs({ page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                    Next →
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
