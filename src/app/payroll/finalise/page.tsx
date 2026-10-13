import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { FinaliseButton } from "./FinaliseButton";

export const dynamic = "force-dynamic";

export default async function FinalisePayrollPage() {
  const { organisationId, org } = await payrollContext();

  const [runs, paidRuns] = await Promise.all([
    prisma.payRun.findMany({
      where: { organisationId, status: "APPROVED" },
      orderBy: { payDate: "asc" },
      select: {
        id: true,
        label: true,
        periodStart: true,
        periodEnd: true,
        payDate: true,
        employeeCount: true,
        grossPay: true,
        netPay: true,
        _count: { select: { lines: true, payslips: true } },
      },
    }),
    prisma.payRun.findMany({
      where: { organisationId, status: "PAID" },
      orderBy: { payDate: "desc" },
      take: 10,
      select: {
        id: true,
        label: true,
        payDate: true,
        employeeCount: true,
        grossPay: true,
        netPay: true,
        paidAt: true,
      },
    }),
  ]);

  const payslipsToGenerate = runs.reduce(
    (a, r) => a + Math.max(0, r._count.lines - r._count.payslips),
    0
  );
  const totalNet = runs.reduce((a, r) => a + Number(r.netPay), 0);
  const totalGross = runs.reduce((a, r) => a + Number(r.grossPay), 0);

  return (
    <div>
      <PageHeader
        title="Finalise payroll"
        subtitle={`${org.name} · issue payslips and mark approved runs as paid`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Ready to pay"
          value={runs.length}
          hint="Approved runs"
          tone={runs.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Payslips to generate"
          value={payslipsToGenerate}
          hint="One per outstanding line"
          tone="indigo"
        />
        <StatCard label="Gross" value={formatMoney(totalGross)} hint="Total before tax" tone="sky" />
        <StatCard label="Net to pay" value={formatMoney(totalNet)} hint="After PAYG" tone="emerald" />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Approved runs ready to pay</h2>
        {runs.length === 0 ? (
          <EmptyState
            title="Nothing to finalise"
            hint="Approved pay runs will appear here so you can issue payslips and mark them paid."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {runs.map((r) => {
              const outstanding = Math.max(0, r._count.lines - r._count.payslips);
              return (
                <div key={r.id} className="card flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/payroll/pay-runs/${r.id}`}
                        className="text-sm font-semibold text-slate-800 hover:text-amber-600 hover:underline"
                      >
                        {r.label}
                      </Link>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {formatDate(r.periodStart)} → {formatDate(r.periodEnd)} · pay{" "}
                        {formatDate(r.payDate)}
                      </div>
                    </div>
                    <Badge tone="blue">Approved</Badge>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                        Employees
                      </dt>
                      <dd className="font-semibold tabular-nums text-slate-900">
                        {r.employeeCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                        Payslips to issue
                      </dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{outstanding}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                        Gross
                      </dt>
                      <dd className="tabular-nums text-slate-700">{formatMoney(r.grossPay)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">Net</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">
                        {formatMoney(r.netPay)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
                    <Link
                      href={`/payroll/pay-runs/${r.id}`}
                      className="text-xs text-amber-600 hover:underline"
                    >
                      View run →
                    </Link>
                    <FinaliseButton id={r.id} label={r.label} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Recent paid runs ── */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Recent paid runs</h2>
        {paidRuns.length === 0 ? (
          <EmptyState
            title="No paid runs yet"
            hint="Once a run has been finalised it will be listed here."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Pay run</th>
                <th className="th">Paid</th>
                <th className="th text-right">Employees</th>
                <th className="th text-right">Gross</th>
                <th className="th text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paidRuns.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <Link
                      href={`/payroll/pay-runs/${r.id}`}
                      className="font-medium text-slate-800 hover:text-amber-600 hover:underline"
                    >
                      {r.label}
                    </Link>
                    <div className="text-[11px] text-slate-400">Pay date {formatDate(r.payDate)}</div>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{formatDate(r.paidAt)}</td>
                  <td className="td text-right tabular-nums text-slate-600">{r.employeeCount}</td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {formatMoney(r.grossPay)}
                  </td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(r.netPay)}
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
