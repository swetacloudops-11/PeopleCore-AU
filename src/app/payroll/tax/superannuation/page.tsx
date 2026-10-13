import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import {
  ChartPanel,
  ColumnChart,
  Donut,
  type ColumnPoint,
  type DonutSegment,
} from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";

const PAID_STATUSES = ["PAID", "PROCESSED"];

const STATUS_TONE: Record<string, string> = {
  PAID: "green",
  PROCESSED: "green",
  PENDING: "amber",
};

export default async function SuperannuationPage() {
  const { organisationId, org } = await payrollContext();

  const [records, total, paid, pending] = await Promise.all([
    prisma.superannuationRecord.findMany({
      where: { organisationId },
      orderBy: [{ periodLabel: "desc" }, { createdAt: "desc" }],
      include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
    }),
    prisma.superannuationRecord.aggregate({
      where: { organisationId },
      _sum: { superAmount: true },
    }),
    prisma.superannuationRecord.count({
      where: { organisationId, status: { in: PAID_STATUSES } },
    }),
    prisma.superannuationRecord.count({ where: { organisationId, status: "PENDING" } }),
  ]);

  const totalAccrued = Number(total._sum.superAmount ?? 0);

  const byPeriod = new Map<string, number>();
  for (const r of records) {
    byPeriod.set(r.periodLabel, (byPeriod.get(r.periodLabel) ?? 0) + Number(r.superAmount));
  }
  const columnPoints = [...byPeriod.entries()].map(
    ([label, value]): ColumnPoint => ({ label, value })
  );

  const byFund = new Map<string, number>();
  for (const r of records) {
    const fund = r.fundName?.trim() || "Unassigned";
    byFund.set(fund, (byFund.get(fund) ?? 0) + Number(r.superAmount));
  }
  const segments = (
    [...byFund.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value })) as DonutSegment[]
  ).filter((s) => s.value > 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Superannuation
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · super guarantee accruals and payments
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/payroll/tax/payg" className="btn-secondary">
            PAYG
          </Link>
          <Link href="/payroll/tax/declarations" className="btn-secondary">
            Declarations
          </Link>
        </div>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Records" value={records.length} hint="Super entries on file" tone="amber" />
        <StatCard
          label="Total super accrued"
          value={formatMoney(totalAccrued)}
          hint="Across all periods"
          tone="rose"
        />
        <StatCard label="Paid" value={paid} hint="Processed to funds" tone="emerald" />
        <StatCard
          label="Pending"
          value={pending}
          hint="Awaiting payment"
          tone={pending ? "amber" : "emerald"}
        />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Super by period" subtitle="Accrued superannuation per period">
          {columnPoints.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No superannuation records yet</p>
          ) : (
            <ColumnChart
              points={columnPoints}
              tone="amber"
              height={128}
              valueFormat={(v) => formatMoney(v)}
            />
          )}
        </ChartPanel>

        <ChartPanel title="Fund distribution" subtitle="Accrued super by fund">
          <Donut
            segments={segments}
            size={136}
            thickness={16}
            centerValue={formatMoney(totalAccrued)}
            centerLabel="accrued"
          />
        </ChartPanel>
      </div>

      {/* ── Table ── */}
      <div className="mt-6">
        {records.length === 0 ? (
          <EmptyState
            title="No superannuation records yet"
            hint="Super guarantee records appear here once pay runs are processed."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Period</th>
                <th className="th text-right">Salary base</th>
                <th className="th text-right">Rate</th>
                <th className="th text-right">Super amount</th>
                <th className="th">Fund</th>
                <th className="th">Member no.</th>
                <th className="th">Status</th>
                <th className="th">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <span className="font-medium text-slate-800">
                      {r.employee.firstName} {r.employee.lastName}
                    </span>
                    <div className="text-[11px] text-slate-400">{r.employee.employeeNumber}</div>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{r.periodLabel}</td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {formatMoney(r.salaryBase)}
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {Number(r.superRate).toFixed(2)}%
                  </td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(r.superAmount)}
                  </td>
                  <td className="td text-slate-600">
                    {r.fundName ?? <span className="text-amber-600">Missing</span>}
                  </td>
                  <td className="td text-slate-600">
                    {r.memberNumber ?? <span className="text-amber-600">Missing</span>}
                  </td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[r.status] ?? "slate"}>{r.status}</Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {r.paidAt ? formatDate(r.paidAt) : "—"}
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
