import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, ColumnChart, type ColumnPoint } from "@/components/charts";
import { formatMoney } from "@/lib/format";

/**
 * Static reference only — AU payroll tax is levied by each state/territory and
 * thresholds and rates change regularly. These figures are indicative and must
 * be confirmed with the relevant revenue office.
 */
const STATE_REFERENCE: { code: string; name: string; threshold: number; rate: number }[] = [
  { code: "NSW", name: "New South Wales", threshold: 1_200_000, rate: 5.45 },
  { code: "VIC", name: "Victoria", threshold: 900_000, rate: 4.85 },
  { code: "QLD", name: "Queensland", threshold: 1_300_000, rate: 4.75 },
  { code: "SA", name: "South Australia", threshold: 1_500_000, rate: 4.95 },
  { code: "WA", name: "Western Australia", threshold: 1_000_000, rate: 5.5 },
  { code: "TAS", name: "Tasmania", threshold: 1_250_000, rate: 4.0 },
  { code: "ACT", name: "Australian Capital Territory", threshold: 2_000_000, rate: 6.85 },
  { code: "NT", name: "Northern Territory", threshold: 1_500_000, rate: 5.5 },
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default async function PayrollTaxPage() {
  const { organisationId, org } = await payrollContext();
  const year = new Date().getFullYear();
  const yearStart = new Date(`${year}-01-01`);

  const [payslips, headcount] = await Promise.all([
    prisma.payslip.findMany({
      where: { organisationId, periodEnd: { gte: yearStart } },
      select: { periodEnd: true, grossPay: true },
    }),
    prisma.employee.count({
      where: { organisationId, employmentStatus: { not: "TERMINATED" } },
    }),
  ]);

  const monthTotals = new Array(12).fill(0) as number[];
  let taxableWages = 0;
  for (const p of payslips) {
    const gross = Number(p.grossPay);
    taxableWages += gross;
    const m = p.periodEnd.getUTCMonth();
    if (m >= 0 && m < 12) monthTotals[m] += gross;
  }

  const columnPoints: ColumnPoint[] = MONTHS.map((label, i) => ({
    label,
    value: Math.round(monthTotals[i]),
  }));

  const orgState = org.state ? org.state.trim().toUpperCase() : null;
  const matchedState = orgState
    ? STATE_REFERENCE.find((s) => s.code === orgState) ?? null
    : null;
  const indicativeLiability = matchedState
    ? Math.max(0, taxableWages - matchedState.threshold) * (matchedState.rate / 100)
    : 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Payroll tax information
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · {orgState ? `state ${orgState}` : "state not set"} · reference guidance only
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/payroll/tax/payg" className="btn-secondary">
            PAYG
          </Link>
          <Link href="/payroll/reports/summary" className="btn-secondary">
            Payroll reports
          </Link>
        </div>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Taxable wages estimate"
          value={formatMoney(taxableWages)}
          hint={`Gross pay for ${year}`}
          tone="amber"
        />
        <StatCard label="Headcount" value={headcount} hint="Active employees" tone="indigo" />
        <StatCard
          label="Payslips this year"
          value={payslips.length}
          hint="Contributing to the estimate"
          tone="sky"
        />
        <StatCard
          label="Org state"
          value={orgState ?? "Not set"}
          hint={matchedState ? matchedState.name : "Set the state in org profile"}
          tone={matchedState ? "emerald" : "rose"}
        />
      </div>

      {/* ── State reference card ── */}
      <section className="mt-6 card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              State &amp; territory payroll tax reference
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Indicative thresholds and rates only — confirm current figures with the relevant
              revenue office before relying on them.
            </p>
          </div>
          <Badge tone="amber">Reference only</Badge>
        </div>

        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">State / territory</th>
              <th className="th text-right">Annual threshold</th>
              <th className="th text-right">Rate above threshold</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {STATE_REFERENCE.map((s) => {
              const activeState = orgState === s.code;
              return (
                <tr
                  key={s.code}
                  className={activeState ? "bg-amber-50/50" : "hover:bg-slate-50/70"}
                >
                  <td className="td">
                    <span className="font-medium text-slate-800">{s.name}</span>
                    <span className="ml-2 text-[11px] text-slate-400">{s.code}</span>
                    {activeState && (
                      <span className="ml-2">
                        <Badge tone="amber">Your state</Badge>
                      </span>
                    )}
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {formatMoney(s.threshold)}
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">{s.rate.toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>

        {matchedState && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <span className="font-medium">Indicative {matchedState.code} liability:</span>{" "}
            {formatMoney(indicativeLiability)} — calculated as wages above the{" "}
            {formatMoney(matchedState.threshold)} threshold × {matchedState.rate.toFixed(2)}%. This is
            a rough estimate from {formatMoney(taxableWages)} of gross pay and is not tax advice.
          </div>
        )}
      </section>

      {/* ── Gross wages by month ── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartPanel title={`Gross wages by month`} subtitle={`${year} payslips across all employees`}>
            {payslips.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No payslips recorded for {year}</p>
            ) : (
              <ColumnChart
                points={columnPoints}
                tone="amber"
                height={140}
                valueFormat={(v) => formatMoney(v)}
              />
            )}
          </ChartPanel>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Monthly gross wages</h2>
          {payslips.length === 0 ? (
            <EmptyState
              title="No wages recorded yet"
              hint={`Payslips issued in ${year} will appear here month by month.`}
            />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Month</th>
                  <th className="th text-right">Gross wages</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MONTHS.map((m, i) => (
                  <tr key={m} className={monthTotals[i] > 0 ? "hover:bg-slate-50/70" : ""}>
                    <td className="td text-slate-600">{m}</td>
                    <td className="td text-right tabular-nums text-slate-700">
                      {monthTotals[i] > 0 ? formatMoney(monthTotals[i]) : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50">
                  <td className="td font-semibold text-slate-800">Total</td>
                  <td className="td text-right font-semibold tabular-nums text-slate-900">
                    {formatMoney(taxableWages)}
                  </td>
                </tr>
              </tbody>
            </TableWrap>
          )}
        </div>
      </div>
    </div>
  );
}
