import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, ColumnChart } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";

const STATUS_TONE: Record<string, string> = {
  PENDING: "amber",
  ISSUED: "blue",
  VIEWED: "green",
};

const shortPeriod = (d: Date) =>
  new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });

export default async function PayHistoryPage() {
  const { employee, organisationId, org } = await employeeContext();
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);

  const [slips, ytd] = await Promise.all([
    prisma.payslip.findMany({
      where: { employeeId: employee.id, organisationId },
      orderBy: { periodEnd: "asc" },
      include: { payRun: { select: { label: true, payDate: true } } },
    }),
    prisma.payslip.findMany({
      where: { employeeId: employee.id, organisationId, periodEnd: { gte: yearStart } },
      select: { grossPay: true, taxAmount: true, superAmount: true, netPay: true },
    }),
  ]);

  const ytdGross = ytd.reduce((a, s) => a + Number(s.grossPay), 0);
  const ytdTax = ytd.reduce((a, s) => a + Number(s.taxAmount), 0);
  const ytdSuper = ytd.reduce((a, s) => a + Number(s.superAmount), 0);
  const ytdNet = ytd.reduce((a, s) => a + Number(s.netPay), 0);

  const recent = slips.slice(-8);
  const grossPoints = recent.map((s) => ({
    label: shortPeriod(s.periodStart),
    value: Math.round(Number(s.grossPay) * 100) / 100,
  }));
  const netPoints = recent.map((s) => ({
    label: shortPeriod(s.periodStart),
    value: Math.round(Number(s.netPay) * 100) / 100,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Pay history
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Every payslip issued to you by {org.name}, oldest first
        </p>
      </div>

      {/* ── Annual totals ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={`${year} gross`} value={formatMoney(ytdGross)} hint="Year to date" tone="emerald" />
        <StatCard label={`${year} tax`} value={formatMoney(ytdTax)} hint="Tax withheld" tone="amber" />
        <StatCard label={`${year} super`} value={formatMoney(ytdSuper)} hint="Contributions" tone="sky" />
        <StatCard label={`${year} net`} value={formatMoney(ytdNet)} hint="Take-home pay" tone="indigo" />
      </div>

      {/* ── Gross vs net per period ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Gross per period" subtitle="Last 8 pay periods">
          <ColumnChart points={grossPoints} tone="sky" height={124} valueFormat={(v) => formatMoney(v)} />
        </ChartPanel>
        <ChartPanel title="Net per period" subtitle="Last 8 pay periods">
          <ColumnChart points={netPoints} tone="violet" height={124} valueFormat={(v) => formatMoney(v)} />
        </ChartPanel>
      </div>

      {/* ── Chronological table ── */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">All payslips</h2>
          <Link href="/employee/payroll/details" className="text-xs text-violet-600 hover:underline">
            Payment details →
          </Link>
        </div>
        {slips.length === 0 ? (
          <EmptyState
            title="No pay history yet"
            hint="Payslips appear here after your first pay run is processed."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Pay run</th>
                <th className="th">Period</th>
                <th className="th">Pay date</th>
                <th className="th">Status</th>
                <th className="th text-right">Gross</th>
                <th className="th text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slips.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">{s.payRun.label}</td>
                  <td className="td whitespace-nowrap text-slate-600">
                    {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{formatDate(s.payRun.payDate)}</td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[s.status] ?? "slate"}>{s.status}</Badge>
                  </td>
                  <td className="td text-right tabular-nums text-slate-700">
                    {formatMoney(Number(s.grossPay))}
                  </td>
                  <td className="td text-right font-medium tabular-nums text-slate-900">
                    {formatMoney(Number(s.netPay))}
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
