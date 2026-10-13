import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { StatCard, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { ApproveButton } from "./ApproveButton";

export const dynamic = "force-dynamic";

export default async function ApprovePayRunPage() {
  const { organisationId, org } = await payrollContext();

  const runs = await prisma.payRun.findMany({
    where: { organisationId, status: "PENDING_APPROVAL" },
    orderBy: { payDate: "asc" },
    select: {
      id: true,
      label: true,
      periodStart: true,
      periodEnd: true,
      payDate: true,
      employeeCount: true,
      grossPay: true,
      taxAmount: true,
      superAmount: true,
      netPay: true,
      _count: { select: { lines: true } },
    },
  });

  const totalNet = runs.reduce((a, r) => a + Number(r.netPay), 0);
  const totalGross = runs.reduce((a, r) => a + Number(r.grossPay), 0);
  const totalEmployees = runs.reduce((a, r) => a + r.employeeCount, 0);

  return (
    <div>
      <PageHeader
        title="Approve pay run"
        subtitle={`${org.name} · sign off calculated runs before they can be paid`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Awaiting approval"
          value={runs.length}
          hint="Ready for sign-off"
          tone={runs.length ? "amber" : "emerald"}
        />
        <StatCard label="Employees" value={totalEmployees} hint="Across these runs" tone="indigo" />
        <StatCard
          label="Gross"
          value={formatMoney(totalGross)}
          hint="Total before tax"
          tone="sky"
        />
        <StatCard label="Net to pay" value={formatMoney(totalNet)} hint="After PAYG" tone="emerald" />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Runs awaiting approval</h2>
        {runs.length === 0 ? (
          <EmptyState
            title="No pay runs awaiting approval"
            hint="Calculated runs will appear here for sign-off."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {runs.map((r) => (
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
                  <span className="text-xs text-slate-500">
                    {r.employeeCount} employees · {r._count.lines} lines
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Gross</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {formatMoney(r.grossPay)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Net</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {formatMoney(r.netPay)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Tax</dt>
                    <dd className="tabular-nums text-slate-700">{formatMoney(r.taxAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Super</dt>
                    <dd className="tabular-nums text-slate-700">{formatMoney(r.superAmount)}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
                  <Link
                    href="/payroll/review"
                    className="text-xs text-amber-600 hover:underline"
                  >
                    Review variances →
                  </Link>
                  <ApproveButton id={r.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
