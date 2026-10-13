import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, StatCard, TableWrap, PageHeader } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";
import { STP_BADGE, STP_TONE, stpState } from "./derive";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  PAID: "green",
  FAILED: "red",
};

export default async function StpReportsPage() {
  const { organisationId, org } = await payrollContext();

  const runs = await prisma.payRun.findMany({
    where: { organisationId },
    orderBy: { payDate: "desc" },
    select: {
      id: true,
      label: true,
      periodStart: true,
      periodEnd: true,
      payDate: true,
      paidAt: true,
      status: true,
      employeeCount: true,
      grossPay: true,
      taxAmount: true,
      superAmount: true,
    },
  });

  const derived = runs.map((run) => ({ run, stp: stpState(run) }));
  const accepted = derived.filter((d) => d.stp.state === "ACCEPTED");
  const ready = derived.filter((d) => d.stp.state === "READY");
  const notReady = derived.filter((d) => d.stp.state === "NOT_READY");
  const lodgedAmount = accepted.reduce((a, d) => a + Number(d.run.grossPay), 0);

  const segments: DonutSegment[] = [
    { label: "Accepted", value: accepted.length, tone: STP_TONE.ACCEPTED },
    { label: "Ready to lodge", value: ready.length, tone: STP_TONE.READY },
    { label: "Not ready", value: notReady.length, tone: STP_TONE.NOT_READY },
  ];

  return (
    <div>
      <PageHeader
        title="STP Reports"
        subtitle={`${org.name} · Single Touch Payroll lodgements derived from pay runs`}
        action={{ label: "Submission status", href: "/payroll/stp/status" }}
      />

      {/* ── Explainer ── */}
      <section className="card border-amber-200 bg-amber-50/50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
            📤
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Single Touch Payroll Phase 2</h2>
            <p className="mt-1 text-sm text-slate-600">
              STP reports salaries and wages, PAYG withholding and superannuation liability
              to the ATO each pay cycle through an STP-enabled payroll product. This console
              derives lodgement state from your pay runs: finalised (paid) runs are treated
              as accepted, approved runs are ready to lodge, and all other runs are not ready.
            </p>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Lodged" value={accepted.length} hint="Accepted by the ATO" tone="emerald" />
        <StatCard label="Ready to lodge" value={ready.length} hint="Approved runs" tone="sky" />
        <StatCard label="Not ready" value={notReady.length} hint="Draft or in progress" tone="amber" />
        <StatCard label="Total lodged" value={formatMoney(lodgedAmount)} hint="Gross of accepted runs" tone="indigo" />
      </div>

      {runs.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No pay runs to lodge"
            hint="Once you run payroll, each run&apos;s STP state will be derived here."
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartPanel title="STP states" subtitle="Distribution across all pay runs">
                <TableWrap>
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Pay run</th>
                      <th className="th">Pay date</th>
                      <th className="th">State</th>
                      <th className="th">Reference</th>
                      <th className="th text-right">Employees</th>
                      <th className="th text-right">Gross</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {derived.map(({ run, stp }) => (
                      <tr key={run.id} className="hover:bg-slate-50/70">
                        <td className="td">
                          <Link
                            href={`/payroll/pay-runs/${run.id}`}
                            className="font-medium text-slate-800 hover:text-amber-600 hover:underline"
                          >
                            {run.label}
                          </Link>
                          <span className="ml-1.5">
                            <Badge tone={STATUS_BADGE[run.status] ?? "slate"}>
                              {run.status.replace(/_/g, " ")}
                            </Badge>
                          </span>
                        </td>
                        <td className="td whitespace-nowrap text-slate-500">{formatDate(run.payDate)}</td>
                        <td className="td">
                          <Badge tone={STP_BADGE[stp.state]}>{stp.label}</Badge>
                        </td>
                        <td className="td font-mono text-[11px] text-slate-500">
                          {stp.reference ?? "—"}
                        </td>
                        <td className="td text-right tabular-nums">{run.employeeCount}</td>
                        <td className="td text-right tabular-nums">{formatMoney(run.grossPay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </ChartPanel>
            </div>

            <div className="space-y-4">
              <ChartPanel title="State breakdown" subtitle="All pay runs on record">
                <Donut
                  segments={segments}
                  size={148}
                  thickness={18}
                  centerValue={runs.length}
                  centerLabel="runs"
                />
              </ChartPanel>

              <div className="card p-4">
                <h3 className="text-sm font-semibold text-slate-800">What gets lodged</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li className="flex justify-between gap-3">
                    <span>Salaries &amp; wages</span>
                    <span className="font-medium tabular-nums text-slate-800">
                      {formatMoney(derived.reduce((a, d) => a + Number(d.run.grossPay), 0))}
                    </span>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span>PAYG withholding</span>
                    <span className="font-medium tabular-nums text-slate-800">
                      {formatMoney(derived.reduce((a, d) => a + Number(d.run.taxAmount), 0))}
                    </span>
                  </li>
                  <li className="flex justify-between gap-3 border-t border-slate-100 pt-2">
                    <span>Super liability</span>
                    <span className="font-medium tabular-nums text-slate-800">
                      {formatMoney(derived.reduce((a, d) => a + Number(d.run.superAmount), 0))}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
