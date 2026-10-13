import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, StatCard, PageHeader } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { GeneratePayslipsButton } from "./GeneratePayslipsButton";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  APPROVED: "blue",
  PAID: "green",
};

export default async function GeneratePayslipsPage() {
  const { organisationId, org } = await payrollContext();

  const runs = await prisma.payRun.findMany({
    where: { organisationId, status: { in: ["APPROVED", "PAID"] } },
    orderBy: { payDate: "desc" },
    select: {
      id: true,
      label: true,
      status: true,
      payDate: true,
      employeeCount: true,
      grossPay: true,
      netPay: true,
      _count: { select: { lines: true, payslips: true } },
    },
  });

  const approved = runs.filter((r) => r.status === "APPROVED");
  const paid = runs.filter((r) => r.status === "PAID");

  const toCreate = approved.reduce(
    (sum, r) => sum + Math.max(0, r._count.lines - r._count.payslips),
    0
  );
  const generated = runs.reduce((sum, r) => sum + r._count.payslips, 0);

  return (
    <div>
      <PageHeader
        title="Generate Payslips"
        subtitle={`${org.name} · pre-create payslips for approved and paid runs`}
        action={{ label: "All payslips", href: "/payroll/payslips" }}
      />

      {/* ── Explainer ── */}
      <section className="card border-amber-200 bg-amber-50/50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
            📄
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Payslips are generated on finalise
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              When a run is finalised its approved lines become issued payslips
              automatically. Generating before finalising pre-creates the payslip rows so
              they are ready to share the moment the run is paid — nothing is sent to
              employees at this step.
            </p>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Ready to generate" value={approved.length} hint="Approved runs" tone="sky" />
        <StatCard label="Already paid" value={paid.length} hint="Paid runs" tone="emerald" />
        <StatCard
          label="Payslips to create"
          value={toCreate}
          hint="Outstanding across approved runs"
          tone={toCreate ? "amber" : "emerald"}
        />
        <StatCard label="Payslips generated" value={generated} hint="Across these runs" tone="amber" />
      </div>

      {runs.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No approved or paid pay runs"
            hint="Approve a pay run first — then you can pre-create its payslips here."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          <RunGroup
            title="Ready to generate"
            subtitle="Approved runs — generating pre-creates the payslip rows"
            runs={approved}
            emptyLabel="No approved runs are waiting."
          />
          <RunGroup
            title="Already generated"
            subtitle="Paid runs — payslips were created when these were finalised"
            runs={paid}
            emptyLabel="No paid runs yet."
          />
        </div>
      )}
    </div>
  );
}

type RunRow = {
  id: string;
  label: string;
  status: string;
  payDate: Date;
  employeeCount: number;
  grossPay: { toString(): string };
  netPay: { toString(): string };
  _count: { lines: number; payslips: number };
};

function RunGroup({
  title,
  subtitle,
  runs,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  runs: RunRow[];
  emptyLabel: string;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
      </div>

      {runs.length === 0 ? (
        <div className="card px-5 py-8 text-center text-sm text-slate-500">{emptyLabel}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {runs.map((run) => {
            const pending = Math.max(0, run._count.lines - run._count.payslips);
            return (
              <div key={run.id} className="card flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/payroll/pay-runs/${run.id}`}
                    className="font-medium text-slate-800 hover:text-amber-600 hover:underline"
                  >
                    {run.label}
                  </Link>
                  <Badge tone={STATUS_BADGE[run.status] ?? "slate"}>
                    {run.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">Pay date {formatDate(run.payDate)}</p>

                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 py-2">
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">Employees</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-800">
                      {run.employeeCount}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 py-2">
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">Lines</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-800">
                      {run._count.lines}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 py-2">
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">Payslips</dt>
                    <dd
                      className={`mt-0.5 text-sm font-semibold ${
                        pending ? "text-amber-600" : "text-emerald-600"
                      }`}
                    >
                      {run._count.payslips}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">
                    {formatMoney(run.grossPay)} gross · {formatMoney(run.netPay)} net
                  </span>
                  <GeneratePayslipsButton
                    payRunId={run.id}
                    label={run.label}
                    pending={pending}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
