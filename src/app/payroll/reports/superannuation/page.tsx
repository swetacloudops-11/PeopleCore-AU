import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs, intParam } from "@/lib/payroll";
import { Badge, EmptyState, StatCard, TableWrap, PageHeader } from "@/components/ui";
import {
  ChartPanel,
  ColumnChart,
  Donut,
  type ColumnPoint,
  type DonutSegment,
} from "@/components/charts";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const RANGES = [30, 90, 365];
const STATUS_BADGE: Record<string, string> = { PAID: "green", LODGED: "green", PENDING: "amber" };

export default async function SuperannuationReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();

  const requested = intParam(sp.range, 365);
  const range = RANGES.includes(requested) ? requested : 365;
  const since = D(-range);

  const records = await prisma.superannuationRecord.findMany({
    where: { organisationId, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: {
      periodLabel: true,
      salaryBase: true,
      superRate: true,
      superAmount: true,
      fundName: true,
      status: true,
      employee: {
        select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      },
    },
  });

  const byPeriod = new Map<string, number>();
  const byFund = new Map<string, number>();
  type EmpAgg = {
    id: string;
    name: string;
    number: string;
    salaryBase: number;
    superAmount: number;
    fund: string;
    status: string;
  };
  const byEmployee = new Map<string, EmpAgg>();

  let accrued = 0;
  let paid = 0;
  let rateSum = 0;

  for (const r of records) {
    const amount = Number(r.superAmount);
    accrued += amount;
    rateSum += Number(r.superRate);
    if (r.status === "PAID") paid += amount;

    byPeriod.set(r.periodLabel, (byPeriod.get(r.periodLabel) ?? 0) + amount);
    const fund = r.fundName ?? "Unfunded";
    byFund.set(fund, (byFund.get(fund) ?? 0) + amount);

    const emp = r.employee;
    const agg = byEmployee.get(emp.id) ?? {
      id: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      number: emp.employeeNumber,
      salaryBase: 0,
      superAmount: 0,
      fund,
      status: r.status,
    };
    agg.salaryBase += Number(r.salaryBase);
    agg.superAmount += amount;
    agg.fund = fund;
    agg.status = r.status;
    byEmployee.set(emp.id, agg);
  }

  const pending = Math.max(0, accrued - paid);
  const averageRate = records.length > 0 ? rateSum / records.length : 0;

  const points: ColumnPoint[] = [...byPeriod.entries()].map(([label, value]) => ({
    label,
    value: Math.round(value),
  }));

  const fundEntries = [...byFund.entries()].sort((a, b) => b[1] - a[1]);
  const fundSegments: DonutSegment[] = fundEntries.slice(0, 6).map(([label, value]) => ({
    label,
    value: Math.round(value),
  }));
  const fundOther = fundEntries.slice(6).reduce((a, [, v]) => a + v, 0);
  if (fundOther > 0) fundSegments.push({ label: "Other", value: Math.round(fundOther), tone: "slate" });

  const employees = [...byEmployee.values()].sort((a, b) => b.superAmount - a.superAmount).slice(0, 25);

  return (
    <div>
      <PageHeader
        title="Superannuation Reports"
        subtitle={`${org.name} · super accrued, paid and by fund`}
        action={{ label: "Payroll summary", href: "/payroll/reports/summary" }}
      />

      {/* ── Range chips ── */}
      <div className="mb-5 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={qs({ range: r })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              range === r
                ? "bg-amber-500 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Last {r} days
          </Link>
        ))}
      </div>

      {records.length === 0 ? (
        <EmptyState
          title="No superannuation records in this range"
          hint="Super accruals appear here once pay runs are processed."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Super accrued" value={formatMoney(accrued)} hint={`Last ${range} days`} tone="amber" />
            <StatCard label="Paid to funds" value={formatMoney(paid)} hint="Settled records" tone="emerald" />
            <StatCard
              label="Pending"
              value={formatMoney(pending)}
              hint="Awaiting payment"
              tone={pending ? "rose" : "emerald"}
            />
            <StatCard
              label="Average rate"
              value={`${averageRate.toFixed(2)}%`}
              hint="Across these records"
              tone="sky"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartPanel title="Super by period" subtitle="Total accrued per pay period">
                {points.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No super recorded</p>
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
            <ChartPanel title="Super by fund" subtitle="Share of accrued super">
              {fundSegments.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No funds recorded</p>
              ) : (
                <Donut
                  segments={fundSegments}
                  size={148}
                  thickness={18}
                  centerValue={formatMoney(accrued)}
                  centerLabel="super"
                />
              )}
            </ChartPanel>
          </div>

          {/* ── Per-employee table ── */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Super by employee</h2>
              <span className="text-[11px] text-slate-400">Top 25 by super</span>
            </div>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Fund</th>
                  <th className="th text-right">Salary base</th>
                  <th className="th text-right">Super</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <span className="font-medium text-slate-800">{e.name}</span>
                      <span className="ml-1.5 text-[11px] text-slate-400">{e.number}</span>
                    </td>
                    <td className="td text-slate-500">{e.fund}</td>
                    <td className="td text-right tabular-nums text-slate-600">{formatMoney(e.salaryBase)}</td>
                    <td className="td text-right font-medium tabular-nums text-slate-800">
                      {formatMoney(e.superAmount)}
                    </td>
                    <td className="td">
                      <Badge tone={STATUS_BADGE[e.status] ?? "slate"}>{e.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </>
      )}
    </div>
  );
}
