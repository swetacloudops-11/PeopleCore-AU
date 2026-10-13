import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, StatCard, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { CalculateButton } from "./CalculateButton";

export const dynamic = "force-dynamic";

export default async function CalculatePayrollPage() {
  const { organisationId, org } = await payrollContext();

  const [runs, activeEmployees] = await Promise.all([
    prisma.payRun.findMany({
      where: { organisationId, status: "DRAFT" },
      orderBy: { payDate: "asc" },
      select: {
        id: true,
        label: true,
        periodStart: true,
        periodEnd: true,
        payDate: true,
        employeeCount: true,
        _count: { select: { lines: true } },
      },
    }),
    prisma.employee.count({
      where: { organisationId, employmentStatus: { not: "TERMINATED" } },
    }),
  ]);

  const totalLines = runs.reduce((a, r) => a + r._count.lines, 0);

  return (
    <div>
      <PageHeader
        title="Calculate payroll"
        subtitle={`${org.name} · cost draft runs into employee lines`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Draft runs"
          value={runs.length}
          hint="Ready to calculate"
          tone={runs.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Active employees"
          value={activeEmployees}
          hint="Lines created per employee"
          tone="indigo"
        />
        <StatCard label="Existing lines" value={totalLines} hint="Across draft runs" tone="sky" />
        <StatCard label="Super rate" value="11.5%" hint="Applied to every line" tone="emerald" />
      </div>

      {/* ── Explainer ── */}
      <div className="mt-5 card p-5">
        <h2 className="text-sm font-semibold text-slate-800">What calculation does</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">
              Lines created
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              One pay run line per active employee. Annual salaries are divided by 26; hourly staff
              are paid their rate for the standard weekly hours.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">
              Superannuation
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Employer super is added at 11.5% of ordinary gross for every line.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">
              PAYG estimate
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Tax is withheld at a simple 25% demo scale, giving a net pay figure for each employee.
            </p>
          </div>
        </div>
      </div>

      {/* ── Draft runs ── */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Draft pay runs</h2>
        {runs.length === 0 ? (
          <EmptyState
            title="No draft pay runs to calculate"
            hint="Create a pay run first — it appears here until it has been calculated."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {runs.map((r) => (
              <div key={r.id} className="card flex flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/payroll/pay-runs/${r.id}`}
                      className="font-medium text-slate-800 hover:text-amber-600 hover:underline"
                    >
                      {r.label}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {formatDate(r.periodStart)} → {formatDate(r.periodEnd)} · pay{" "}
                      {formatDate(r.payDate)}
                    </div>
                  </div>
                  <Badge tone="slate">Draft</Badge>
                </div>

                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                  <div>
                    <dt className="inline">Employees: </dt>
                    <dd className="inline font-medium text-slate-700">{r.employeeCount}</dd>
                  </div>
                  <div>
                    <dt className="inline">Existing lines: </dt>
                    <dd className="inline font-medium text-slate-700">{r._count.lines}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <Link
                    href={`/payroll/pay-runs/${r.id}`}
                    className="text-xs text-amber-600 hover:underline"
                  >
                    View run →
                  </Link>
                  <CalculateButton id={r.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {runs.length > 0 && (
        <p className="mt-4 text-xs text-slate-500">
          Estimated cost across {runs.length} draft run{runs.length === 1 ? "" : "s"} — calculate
          each run individually.
        </p>
      )}
    </div>
  );
}
