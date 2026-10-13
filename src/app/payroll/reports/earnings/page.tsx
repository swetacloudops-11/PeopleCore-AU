import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs, intParam } from "@/lib/payroll";
import { EmptyState, StatCard, TableWrap, PageHeader } from "@/components/ui";
import {
  BarList,
  ChartPanel,
  ColumnChart,
  Donut,
  type BarItem,
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

export default async function EarningsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();

  const requested = intParam(sp.range, 365);
  const range = RANGES.includes(requested) ? requested : 365;
  const since = D(-range);

  const lines = await prisma.payRunLine.findMany({
    where: { payRun: { organisationId, payDate: { gte: since } } },
    select: {
      grossPay: true,
      hoursWorked: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          department: { select: { name: true } },
        },
      },
      payRun: { select: { payDate: true } },
    },
  });

  type EmpAgg = { id: string; name: string; number: string; department: string; gross: number; hours: number };
  const byEmployee = new Map<string, EmpAgg>();
  const byDept = new Map<string, number>();
  const byMonth = new Map<string, { value: number; date: Date }>();

  for (const line of lines) {
    const gross = Number(line.grossPay);
    const hours = Number(line.hoursWorked);
    const emp = line.employee;
    const dept = emp.department?.name ?? "Unassigned";

    const agg = byEmployee.get(emp.id) ?? {
      id: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      number: emp.employeeNumber,
      department: dept,
      gross: 0,
      hours: 0,
    };
    agg.gross += gross;
    agg.hours += hours;
    byEmployee.set(emp.id, agg);

    byDept.set(dept, (byDept.get(dept) ?? 0) + gross);

    const monthKey = line.payRun.payDate.toISOString().slice(0, 7);
    const month = byMonth.get(monthKey) ?? { value: 0, date: line.payRun.payDate };
    month.value += gross;
    byMonth.set(monthKey, month);
  }

  const employees = [...byEmployee.values()].sort((a, b) => b.gross - a.gross);
  const top25 = employees.slice(0, 25);

  const totalGross = employees.reduce((a, e) => a + e.gross, 0);
  const totalHours = employees.reduce((a, e) => a + e.hours, 0);

  const earners: BarItem[] = employees.slice(0, 10).map((e): BarItem => ({
    label: e.name,
    value: Math.round(e.gross),
    hint: `${e.hours.toFixed(1)}h · ${e.number}`,
    tone: "amber",
  }));

  const deptEntries = [...byDept.entries()].sort((a, b) => b[1] - a[1]);
  const deptSegments: DonutSegment[] = deptEntries.slice(0, 6).map(([label, value]) => ({
    label,
    value: Math.round(value),
  }));
  const deptOther = deptEntries.slice(6).reduce((a, [, v]) => a + v, 0);
  if (deptOther > 0) deptSegments.push({ label: "Other", value: Math.round(deptOther), tone: "slate" });

  const monthPoints: ColumnPoint[] = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, m]) => ({ label: formatDate(m.date), value: Math.round(m.value) }));

  return (
    <div>
      <PageHeader
        title="Earnings Reports"
        subtitle={`${org.name} · gross earnings and hours by employee`}
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

      {employees.length === 0 ? (
        <EmptyState
          title="No earnings in this range"
          hint="Widen the range, or calculate a pay run to produce earnings lines."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Gross earnings" value={formatMoney(totalGross)} hint={`Last ${range} days`} tone="amber" />
            <StatCard label="Employees paid" value={employees.length} hint="With earnings lines" tone="sky" />
            <StatCard label="Total hours" value={totalHours.toFixed(1)} hint="Across all lines" tone="indigo" />
            <StatCard
              label="Average hourly"
              value={totalHours > 0 ? formatMoney(totalGross / totalHours) : "—"}
              hint="Gross ÷ hours"
              tone="emerald"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartPanel title="Top earners" subtitle={`Highest gross · last ${range} days`}>
                <BarList items={earners} valueFormat={(v) => formatMoney(v)} showPercents={false} />
              </ChartPanel>
            </div>
            <ChartPanel title="Earnings by department" subtitle="Share of gross pay">
              {deptSegments.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No earnings yet</p>
              ) : (
                <Donut
                  segments={deptSegments}
                  size={148}
                  thickness={18}
                  centerValue={formatMoney(totalGross)}
                  centerLabel="gross"
                />
              )}
            </ChartPanel>
          </div>

          <div className="mt-4">
            <ChartPanel title="Earnings per month" subtitle="Total gross by calendar month">
              {monthPoints.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No monthly data</p>
              ) : (
                <ColumnChart
                  points={monthPoints}
                  tone="amber"
                  height={132}
                  valueFormat={(v) => `$${Math.round(v / 1000)}k`}
                />
              )}
            </ChartPanel>
          </div>

          {/* ── Top 25 table ── */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Earnings by employee</h2>
              <span className="text-[11px] text-slate-400">Top 25 by gross</span>
            </div>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Department</th>
                  <th className="th text-right">Hours</th>
                  <th className="th text-right">Gross</th>
                  <th className="th text-right">Avg / hour</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {top25.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <span className="font-medium text-slate-800">{e.name}</span>
                      <span className="ml-1.5 text-[11px] text-slate-400">{e.number}</span>
                    </td>
                    <td className="td text-slate-500">{e.department}</td>
                    <td className="td text-right tabular-nums text-slate-600">{e.hours.toFixed(1)}</td>
                    <td className="td text-right font-medium tabular-nums text-slate-800">
                      {formatMoney(e.gross)}
                    </td>
                    <td className="td text-right tabular-nums text-slate-500">
                      {e.hours > 0 ? formatMoney(e.gross / e.hours) : "—"}
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
