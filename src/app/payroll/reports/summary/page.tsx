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
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const RANGES = [30, 90, 365];
const STATUS_BADGE: Record<string, string> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  PAID: "green",
  FAILED: "red",
};

export default async function PayrollSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();

  const requested = intParam(sp.range, 90);
  const range = RANGES.includes(requested) ? requested : 90;
  const since = D(-range);
  const yearStart = new Date(`${new Date().getFullYear()}-01-01`);

  const [runs, paidEmployees] = await Promise.all([
    prisma.payRun.findMany({
      where: { organisationId },
      orderBy: { payDate: "asc" },
      select: {
        id: true,
        label: true,
        periodStart: true,
        periodEnd: true,
        payDate: true,
        status: true,
        employeeCount: true,
        grossPay: true,
        superAmount: true,
        taxAmount: true,
        netPay: true,
      },
    }),
    prisma.payslip.findMany({
      where: { organisationId },
      distinct: ["employeeId"],
      select: { employeeId: true },
    }),
  ]);

  const inRange = runs.filter((r) => r.payDate >= since);
  const thisYear = runs.filter((r) => r.payDate >= yearStart);

  const totals = inRange.reduce(
    (acc, r) => ({
      gross: acc.gross + Number(r.grossPay),
      super: acc.super + Number(r.superAmount),
      tax: acc.tax + Number(r.taxAmount),
      net: acc.net + Number(r.netPay),
    }),
    { gross: 0, super: 0, tax: 0, net: 0 }
  );

  const grossPoints: ColumnPoint[] = inRange.map((r) => ({
    label: r.label.replace(/^Pay run /, "#").split("—")[0].trim(),
    value: Math.round(Number(r.grossPay)),
  }));
  const netPoints: ColumnPoint[] = inRange.map((r) => ({
    label: r.label.replace(/^Pay run /, "#").split("—")[0].trim(),
    value: Math.round(Number(r.netPay)),
  }));

  const composition: DonutSegment[] = [
    { label: "Net pay", value: Math.round(totals.net), tone: "emerald" },
    { label: "PAYG tax", value: Math.round(totals.tax), tone: "amber" },
    { label: "Super", value: Math.round(totals.super), tone: "sky" },
  ];

  return (
    <div>
      <PageHeader
        title="Payroll Summary"
        subtitle={`${org.name} · cost and composition across pay runs`}
        action={{ label: "Pay run reports", href: "/payroll/reports/pay-run" }}
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

      {runs.length === 0 ? (
        <EmptyState
          title="No payroll data yet"
          hint="Summary metrics appear once your first pay run is created."
        />
      ) : (
        <>
          {/* ── Headline metrics ── */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Runs this year" value={thisYear.length} hint={String(new Date().getFullYear())} tone="amber" />
            <StatCard label="Employees paid" value={paidEmployees.length} hint="Distinct payslips" tone="sky" />
            <StatCard label="Total gross" value={formatMoney(totals.gross)} hint={`Last ${range} days`} tone="indigo" />
            <StatCard label="Total tax" value={formatMoney(totals.tax)} hint={`Last ${range} days`} tone="rose" />
            <StatCard label="Total super" value={formatMoney(totals.super)} hint={`Last ${range} days`} tone="emerald" />
            <StatCard label="Total net" value={formatMoney(totals.net)} hint={`Last ${range} days`} tone="emerald" />
          </div>

          {/* ── Charts ── */}
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartPanel title="Gross & net per pay run" subtitle={`Pay runs in the last ${range} days`}>
                {inRange.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No pay runs in this range</p>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Gross
                      </p>
                      <ColumnChart
                        points={grossPoints}
                        tone="amber"
                        height={110}
                        valueFormat={(v) => `$${Math.round(v / 1000)}k`}
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Net
                      </p>
                      <ColumnChart
                        points={netPoints}
                        tone="emerald"
                        height={110}
                        valueFormat={(v) => `$${Math.round(v / 1000)}k`}
                      />
                    </div>
                  </div>
                )}
              </ChartPanel>
            </div>

            <ChartPanel title="Gross composition" subtitle={`Net vs tax vs super · last ${range} days`}>
              <Donut
                segments={composition}
                size={148}
                thickness={18}
                centerValue={formatMoney(totals.gross)}
                centerLabel="gross"
              />
            </ChartPanel>
          </div>

          {/* ── Per-run table ── */}
          <div className="mt-6">
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Pay run</th>
                  <th className="th">Period</th>
                  <th className="th">Pay date</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Employees</th>
                  <th className="th text-right">Gross</th>
                  <th className="th text-right">Tax</th>
                  <th className="th text-right">Super</th>
                  <th className="th text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inRange.length === 0 ? (
                  <tr>
                    <td className="td text-slate-500" colSpan={9}>
                      No pay runs in the last {range} days.
                    </td>
                  </tr>
                ) : (
                  inRange.map((r) => (
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
                      <td className="td text-right tabular-nums">{r.employeeCount}</td>
                      <td className="td text-right tabular-nums">{formatMoney(r.grossPay)}</td>
                      <td className="td text-right tabular-nums">{formatMoney(r.taxAmount)}</td>
                      <td className="td text-right tabular-nums">{formatMoney(r.superAmount)}</td>
                      <td className="td text-right font-medium tabular-nums text-slate-800">
                        {formatMoney(r.netPay)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableWrap>
          </div>
        </>
      )}
    </div>
  );
}
