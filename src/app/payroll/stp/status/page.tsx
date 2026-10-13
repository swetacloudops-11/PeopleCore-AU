import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, StatCard, PageHeader } from "@/components/ui";
import { ChartPanel, StackedBar, type DonutSegment } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";
import { STP_BADGE, STP_TONE, stpState, type StpState } from "../derive";

export const dynamic = "force-dynamic";

const BOARD_STYLE: Record<StpState, { ring: string; dot: string }> = {
  ACCEPTED: { ring: "border-emerald-200", dot: "bg-emerald-500" },
  READY: { ring: "border-sky-200", dot: "bg-sky-500" },
  NOT_READY: { ring: "border-slate-200", dot: "bg-slate-400" },
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function StpStatusPage() {
  const { organisationId, org } = await payrollContext();

  const [runs, schedules] = await Promise.all([
    prisma.payRun.findMany({
      where: { organisationId },
      orderBy: { payDate: "desc" },
      select: {
        id: true,
        label: true,
        payDate: true,
        paidAt: true,
        status: true,
        employeeCount: true,
        grossPay: true,
      },
    }),
    prisma.paySchedule.findMany({
      where: { organisationId, isActive: true },
      orderBy: { nextRunDate: "asc" },
      select: { id: true, name: true, frequency: true, payDay: true, nextRunDate: true },
    }),
  ]);

  const derived = runs.map((run) => ({ run, stp: stpState(run) }));
  const accepted = derived.filter((d) => d.stp.state === "ACCEPTED");
  const ready = derived.filter((d) => d.stp.state === "READY");
  const notReady = derived.filter((d) => d.stp.state === "NOT_READY");

  const pendingAmount = ready.reduce((a, d) => a + Number(d.run.grossPay), 0);

  const segments: DonutSegment[] = [
    { label: "Accepted", value: accepted.length, tone: STP_TONE.ACCEPTED },
    { label: "Ready to lodge", value: ready.length, tone: STP_TONE.READY },
    { label: "Not ready", value: notReady.length, tone: STP_TONE.NOT_READY },
  ];

  const boards: Array<{ state: StpState; title: string; hint: string; items: typeof derived }> = [
    { state: "ACCEPTED", title: "Accepted", hint: "Lodged with the ATO", items: accepted },
    { state: "READY", title: "Ready to lodge", hint: "Approved runs awaiting lodgement", items: ready },
    { state: "NOT_READY", title: "Not ready", hint: "Draft or in-progress runs", items: notReady },
  ];

  const nextSchedule = schedules.find((s) => s.nextRunDate) ?? null;
  const nextRunDate = nextSchedule?.nextRunDate ?? null;

  return (
    <div>
      <PageHeader
        title="Submission Status"
        subtitle={`${org.name} · current STP lodgement state across pay runs`}
        action={{ label: "Submission history", href: "/payroll/stp/history" }}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Accepted" value={accepted.length} hint="Lodged runs" tone="emerald" />
        <StatCard label="Ready to lodge" value={ready.length} hint="Approved runs" tone="sky" />
        <StatCard label="Not ready" value={notReady.length} hint="Draft or in progress" tone="amber" />
        <StatCard label="Awaiting lodgement" value={formatMoney(pendingAmount)} hint="Gross of ready runs" tone="indigo" />
      </div>

      {runs.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No pay runs to report"
            hint="STP states appear once pay runs exist."
          />
        </div>
      ) : (
        <>
          {/* ── State board ── */}
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {boards.map((board) => (
              <div key={board.state} className={`card ${BOARD_STYLE[board.state].ring} p-4`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${BOARD_STYLE[board.state].dot}`} />
                    <h2 className="text-sm font-semibold text-slate-800">{board.title}</h2>
                  </div>
                  <Badge tone={STP_BADGE[board.state]}>{board.items.length}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-400">{board.hint}</p>

                {board.items.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-400">Nothing here.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {board.items.slice(0, 4).map(({ run, stp }) => (
                      <li key={run.id} className="flex items-center justify-between gap-2 py-2">
                        <Link
                          href={`/payroll/pay-runs/${run.id}`}
                          className="min-w-0 truncate text-[13px] font-medium text-slate-700 hover:text-amber-600 hover:underline"
                        >
                          {run.label}
                        </Link>
                        <span className="shrink-0 text-right text-[11px] text-slate-400">
                          {stp.reference ? (
                            <span className="font-mono">{stp.reference}</span>
                          ) : (
                            formatDate(run.payDate)
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* ── Stacked bar + schedule ── */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartPanel title="States across all runs" subtitle="Accepted · ready · not ready">
                <StackedBar segments={segments} height={14} />
              </ChartPanel>
            </div>

            <div className="card p-4">
              <h2 className="text-sm font-semibold text-slate-800">Next scheduled lodgement</h2>
              {nextSchedule && nextRunDate ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-lg font-semibold text-slate-900">
                    {formatDate(nextRunDate)}
                  </p>
                  <p className="text-slate-500">
                    {nextSchedule.name} ·{" "}
                    {nextSchedule.frequency.charAt(0) +
                      nextSchedule.frequency.slice(1).toLowerCase()}{" "}
                    · pays {DAYS[nextSchedule.payDay] ?? "—"}
                  </p>
                  <p className="text-xs text-slate-400">
                    New lodgements are submitted when the next run is finalised.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  No active pay schedule with a next run date.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
