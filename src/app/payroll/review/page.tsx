import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, StatCard, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const VARIANCE_THRESHOLD = 0.1;

export default async function ReviewPayrollPage() {
  const { organisationId, org } = await payrollContext();

  const [runs, allRuns] = await Promise.all([
    prisma.payRun.findMany({
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
        _count: { select: { lines: true, payslips: true } },
      },
    }),
    prisma.payRun.findMany({
      where: { organisationId },
      orderBy: [{ payDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, payDate: true, grossPay: true },
    }),
  ]);

  // Previous run's gross (by pay date) so we can flag big swings.
  const previousGross = new Map<string, number | null>();
  allRuns.forEach((r, i) => {
    previousGross.set(r.id, i > 0 ? Number(allRuns[i - 1].grossPay) : null);
  });

  const reviewed = runs.map((r) => {
    const lines = r._count.lines;
    const lineGap = lines < r.employeeCount;
    const gross = Number(r.grossPay);
    const prev = previousGross.get(r.id) ?? null;
    const variance = prev && prev > 0 ? (gross - prev) / prev : 0;
    const varianceFlag = prev !== null && Math.abs(variance) > VARIANCE_THRESHOLD;
    return { run: r, lines, lineGap, prev, variance, varianceFlag };
  });

  const totalGross = reviewed.reduce((a, x) => a + Number(x.run.grossPay), 0);
  const lineGaps = reviewed.filter((x) => x.lineGap).length;
  const varianceWarnings = reviewed.filter((x) => x.varianceFlag).length;

  return (
    <div>
      <PageHeader
        title="Review payroll"
        subtitle={`${org.name} · check totals and variances before approving`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Awaiting approval"
          value={runs.length}
          hint="Runs pending review"
          tone={runs.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Gross pending"
          value={formatMoney(totalGross)}
          hint="Across reviewed runs"
          tone="indigo"
        />
        <StatCard
          label="Line gaps"
          value={lineGaps}
          hint="Fewer lines than employees"
          tone={lineGaps ? "rose" : "emerald"}
        />
        <StatCard
          label="Variances"
          value={varianceWarnings}
          hint="Gross beyond ±10% of previous"
          tone={varianceWarnings ? "rose" : "emerald"}
        />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Runs pending approval</h2>
        {reviewed.length === 0 ? (
          <EmptyState
            title="Nothing to review"
            hint="Calculated pay runs waiting on approval will appear here."
          />
        ) : (
          <div className="space-y-3">
            {reviewed.map(({ run, lines, lineGap, prev, variance, varianceFlag }) => (
              <div key={run.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/payroll/pay-runs/${run.id}`}
                      className="text-sm font-semibold text-slate-800 hover:text-amber-600 hover:underline"
                    >
                      {run.label}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {formatDate(run.periodStart)} → {formatDate(run.periodEnd)} · pay{" "}
                      {formatDate(run.payDate)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {lineGap && <Badge tone="red">Line gap</Badge>}
                    {varianceFlag && <Badge tone="amber">Variance</Badge>}
                    <Badge tone="amber">Pending approval</Badge>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">
                      Employees
                    </div>
                    <div className="font-semibold tabular-nums text-slate-900">
                      {run.employeeCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">
                      Lines / slips
                    </div>
                    <div className="font-semibold tabular-nums text-slate-900">
                      {lines} / {run._count.payslips}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Gross</div>
                    <div className="font-semibold tabular-nums text-slate-900">
                      {formatMoney(run.grossPay)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">
                      Tax + super
                    </div>
                    <div className="font-semibold tabular-nums text-slate-900">
                      {formatMoney(Number(run.taxAmount) + Number(run.superAmount))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Net</div>
                    <div className="font-semibold tabular-nums text-slate-900">
                      {formatMoney(run.netPay)}
                    </div>
                  </div>
                </div>

                {(lineGap || varianceFlag) && (
                  <div className="mt-3 space-y-1">
                    {lineGap && (
                      <p className="text-xs font-medium text-rose-600">
                        Only {lines} line{lines === 1 ? "" : "s"} for {run.employeeCount} employees —
                        recalculate or check terminated staff.
                      </p>
                    )}
                    {varianceFlag && (
                      <p className="text-xs font-medium text-amber-700">
                        Gross is {variance > 0 ? "up" : "down"}{" "}
                        {Math.abs(Math.round(variance * 100))}% versus the previous run (
                        {formatMoney(prev ?? 0)}) — outside the ±10% tolerance.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
