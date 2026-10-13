import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs, intParam } from "@/lib/payroll";
import { Badge, EmptyState, StatCard, TableWrap, PageHeader } from "@/components/ui";
import { ChartPanel, ColumnChart, type ColumnPoint } from "@/components/charts";
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

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();

  const requested = intParam(sp.range, 365);
  const range = RANGES.includes(requested) ? requested : 365;
  const since = D(-range);

  const records = await prisma.paygRecord.findMany({
    where: { organisationId, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: {
      periodLabel: true,
      grossPay: true,
      taxWithheld: true,
      cumulativeGross: true,
      cumulativeTax: true,
      status: true,
      employee: {
        select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      },
    },
  });

  type PeriodAgg = { label: string; gross: number; tax: number };
  const byPeriod = new Map<string, PeriodAgg>();
  type EmpAgg = {
    id: string;
    name: string;
    number: string;
    gross: number;
    tax: number;
    cumulativeTax: number;
    status: string;
  };
  const byEmployee = new Map<string, EmpAgg>();

  let ytdGross = 0;
  let ytdTax = 0;

  for (const r of records) {
    const gross = Number(r.grossPay);
    const tax = Number(r.taxWithheld);
    ytdGross += gross;
    ytdTax += tax;

    const period = byPeriod.get(r.periodLabel) ?? { label: r.periodLabel, gross: 0, tax: 0 };
    period.gross += gross;
    period.tax += tax;
    byPeriod.set(r.periodLabel, period);

    const emp = r.employee;
    const agg = byEmployee.get(emp.id) ?? {
      id: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      number: emp.employeeNumber,
      gross: 0,
      tax: 0,
      cumulativeTax: 0,
      status: r.status,
    };
    agg.gross += gross;
    agg.tax += tax;
    agg.cumulativeTax = Math.max(agg.cumulativeTax, Number(r.cumulativeTax));
    agg.status = r.status;
    byEmployee.set(emp.id, agg);
  }

  const points: ColumnPoint[] = [...byPeriod.values()].map((p) => ({
    label: p.label,
    value: Math.round(p.tax),
  }));
  const employees = [...byEmployee.values()].sort((a, b) => b.tax - a.tax).slice(0, 25);
  const effectiveRate = ytdGross > 0 ? (ytdTax / ytdGross) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Tax Reports"
        subtitle={`${org.name} · PAYG withholding by period and employee`}
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
          title="No PAYG records in this range"
          hint="Withholding records appear here once pay runs are processed."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            <StatCard label="YTD gross" value={formatMoney(ytdGross)} hint={`Last ${range} days`} tone="amber" />
            <StatCard label="YTD tax withheld" value={formatMoney(ytdTax)} hint={`Last ${range} days`} tone="rose" />
            <StatCard
              label="Effective tax rate"
              value={`${effectiveRate.toFixed(1)}%`}
              hint="Tax withheld ÷ gross"
              tone="sky"
            />
          </div>

          <div className="mt-6">
            <ChartPanel title="Total withheld by period" subtitle="PAYG recorded per pay period">
              {points.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No withholding yet</p>
              ) : (
                <ColumnChart
                  points={points}
                  tone="rose"
                  height={132}
                  valueFormat={(v) => `$${Math.round(v / 1000)}k`}
                />
              )}
            </ChartPanel>
          </div>

          {/* ── Per-employee table ── */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Withholding by employee</h2>
              <span className="text-[11px] text-slate-400">Top 25 by tax withheld</span>
            </div>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th text-right">Gross</th>
                  <th className="th text-right">Tax withheld</th>
                  <th className="th text-right">Cumulative tax</th>
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
                    <td className="td text-right tabular-nums text-slate-600">{formatMoney(e.gross)}</td>
                    <td className="td text-right font-medium tabular-nums text-slate-800">
                      {formatMoney(e.tax)}
                    </td>
                    <td className="td text-right tabular-nums text-slate-500">
                      {formatMoney(e.cumulativeTax)}
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
