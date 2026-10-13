import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  PAID: "green",
  FAILED: "red",
};

export default async function PayrollCalculationErrorsPage() {
  const { organisationId, org } = await payrollContext();

  const runs = await prisma.payRun.findMany({
    where: { organisationId },
    orderBy: { periodStart: "desc" },
    select: {
      id: true,
      label: true,
      status: true,
      periodStart: true,
      payDate: true,
      employeeCount: true,
      grossPay: true,
      createdAt: true,
      _count: { select: { lines: true } },
    },
  });

  const cutoff = D(-7);

  const failed = runs.filter((r) => r.status === "FAILED");
  const nothingCalculated = runs.filter((r) => r.employeeCount > 0 && r._count.lines === 0);
  const staleDrafts = runs.filter((r) => r.status === "DRAFT" && r.createdAt < cutoff);

  type Row = { run: (typeof runs)[number]; classes: string[] };
  const rows: Row[] = [];
  for (const r of runs) {
    const classes: string[] = [];
    if (r.status === "FAILED") classes.push("Failed run");
    if (r.employeeCount > 0 && r._count.lines === 0) classes.push("Nothing calculated");
    if (r.status === "DRAFT" && r.createdAt < cutoff) classes.push("Stale draft");
    if (classes.length > 0) rows.push({ run: r, classes });
  }

  const errorClasses = [
    {
      key: "failed",
      icon: "⛔",
      title: "Failed runs",
      count: failed.length,
      body: "The run stopped before completion — usually a missing pay rate, invalid tax file number or a rejected calculation. Open the run to read the failure reason.",
    },
    {
      key: "nothing",
      icon: "🧮",
      title: "Nothing calculated",
      count: nothingCalculated.length,
      body: "The run expects employees but has no pay run lines. Recalculate once the employees have valid salary or hourly rates.",
    },
    {
      key: "stale",
      icon: "🕰️",
      title: "Stale drafts",
      count: staleDrafts.length,
      body: "Draft runs older than 7 days have not been calculated or submitted. Calculate and submit them before the pay date slips.",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payroll Calculation Errors"
        subtitle={`${rows.length} run${rows.length === 1 ? "" : "s"} needing attention for ${org.name}`}
        action={{ label: "All pay runs", href: "/payroll/pay-runs" }}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Runs with issues"
          value={rows.length}
          hint={`of ${runs.length} total`}
          tone={rows.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Failed"
          value={failed.length}
          hint="Calculation stopped"
          tone={failed.length ? "rose" : "emerald"}
        />
        <StatCard
          label="Nothing calculated"
          value={nothingCalculated.length}
          hint="Zero lines generated"
          tone={nothingCalculated.length ? "rose" : "emerald"}
        />
        <StatCard
          label="Stale drafts"
          value={staleDrafts.length}
          hint="Draft over 7 days old"
          tone={staleDrafts.length ? "amber" : "emerald"}
        />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {errorClasses.map((c) => (
          <div key={c.key} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{c.icon}</span>
                <h3 className="text-sm font-semibold text-slate-800">{c.title}</h3>
              </div>
              <span
                className={`text-lg font-semibold ${
                  c.count > 0 ? "text-amber-600" : "text-slate-400"
                }`}
              >
                {c.count}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{c.body}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Affected runs</h2>
        {rows.length === 0 ? (
          <EmptyState
            title="No calculation errors"
            hint="Runs that fail, calculate nothing, or stall as drafts will be listed here."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Pay run</th>
                <th className="th">Period</th>
                <th className="th">Status</th>
                <th className="th">Employees</th>
                <th className="th">Lines</th>
                <th className="th">Gross</th>
                <th className="th">Issue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ run, classes }) => (
                <tr key={run.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <Link
                      href={`/payroll/pay-runs/${run.id}`}
                      className="font-medium text-slate-800 hover:text-amber-600 hover:underline"
                    >
                      {run.label}
                    </Link>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDate(run.periodStart)} — {formatDate(run.payDate)}
                  </td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[run.status] ?? "slate"}>
                      {run.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="td text-slate-600">{run.employeeCount}</td>
                  <td className="td text-slate-600">{run._count.lines}</td>
                  <td className="td whitespace-nowrap text-slate-600">
                    {formatMoney(Number(run.grossPay))}
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {classes.map((c) => (
                        <Badge key={c} tone="amber">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}
