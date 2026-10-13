import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs, intParam } from "@/lib/payroll";
import { Badge, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, formatDateTime, formatMoney, cx } from "@/lib/format";
import { PayRunActions } from "./PayRunActions";

export const dynamic = "force-dynamic";

const LINES_PAGE = 25;
const ORDER = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID"] as const;

/** Status → badge tone (Badge tones). */
const STATUS_BADGE: Record<string, string> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  PAID: "green",
  FAILED: "red",
};

const PAYSLIP_TONE: Record<string, string> = {
  PENDING: "amber",
  ISSUED: "green",
  VIEWED: "blue",
};

export default async function PayRunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const page = intParam(sp.page, 1, 1000);
  const { organisationId, org } = await payrollContext();

  const run = await prisma.payRun.findFirst({
    where: { id, organisationId },
    include: {
      paySchedule: { select: { name: true, frequency: true } },
      _count: { select: { lines: true, payslips: true } },
    },
  });
  if (!run) notFound();

  const [lineCount, lines, payslipGroups] = await Promise.all([
    prisma.payRunLine.count({ where: { payRunId: run.id } }),
    prisma.payRunLine.findMany({
      where: { payRunId: run.id },
      orderBy: { employee: { lastName: "asc" } },
      skip: (page - 1) * LINES_PAGE,
      take: LINES_PAGE,
      select: {
        id: true,
        hoursWorked: true,
        grossPay: true,
        superAmount: true,
        taxAmount: true,
        netPay: true,
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeNumber: true,
            department: { select: { name: true } },
          },
        },
      },
    }),
    prisma.payslip.groupBy({ by: ["status"], where: { payRunId: run.id }, _count: true }),
  ]);

  const linePages = Math.max(1, Math.ceil(lineCount / LINES_PAGE));
  const payslipCounts = Object.fromEntries(payslipGroups.map((g) => [g.status, g._count]));

  const currentIndex =
    run.status === "FAILED" ? -1 : ORDER.indexOf(run.status as (typeof ORDER)[number]);

  const steps: { key: string; label: string; at: string }[] = [
    { key: "DRAFT", label: "Draft", at: formatDate(run.createdAt) },
    {
      key: "PENDING_APPROVAL",
      label: "Pending approval",
      at: currentIndex >= 1 ? "Awaiting approval" : "—",
    },
    {
      key: "APPROVED",
      label: "Approved",
      at: run.approvedAt ? formatDateTime(run.approvedAt) : "—",
    },
    { key: "PAID", label: "Paid", at: run.paidAt ? formatDateTime(run.paidAt) : "—" },
  ];

  const mixSegments = (
    [
      { label: "Gross pay", value: Number(run.grossPay), tone: "amber" },
      { label: "PAYG withheld", value: Number(run.taxAmount), tone: "rose" },
      { label: "Superannuation", value: Number(run.superAmount), tone: "sky" },
      { label: "Net pay", value: Number(run.netPay), tone: "emerald" },
    ] as DonutSegment[]
  ).filter((s) => s.value > 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/payroll/pay-runs" className="text-sm text-amber-600 hover:underline">
          ← All pay runs
        </Link>
        <Badge tone={STATUS_BADGE[run.status] ?? "slate"}>
          {run.status.replace(/_/g, " ")}
        </Badge>
      </div>

      {/* ── Header ── */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {run.label}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {org.name} · {formatDate(run.periodStart)} → {formatDate(run.periodEnd)} · pay date{" "}
              {formatDate(run.payDate)}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>
              Schedule:{" "}
              <span className="font-medium text-slate-700">
                {run.paySchedule
                  ? `${run.paySchedule.name} (${run.paySchedule.frequency.toLowerCase()})`
                  : "None"}
              </span>
            </div>
            <div className="mt-0.5">
              {run._count.lines} line{run._count.lines === 1 ? "" : "s"} ·{" "}
              {run._count.payslips} payslip{run._count.payslips === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {run.notes && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {run.notes}
          </p>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Employees", value: String(run.employeeCount) },
          { label: "Gross pay", value: formatMoney(run.grossPay) },
          { label: "Tax withheld", value: formatMoney(run.taxAmount) },
          { label: "Superannuation", value: formatMoney(run.superAmount) },
          { label: "Net pay", value: formatMoney(run.netPay) },
        ].map((t) => (
          <div key={t.label} className="card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t.label}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{t.value}</div>
          </div>
        ))}
      </div>

      {/* ── Workflow + actions ── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-800">Workflow</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Draft → pending approval → approved → paid
          </p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-4">
            {steps.map((s, i) => {
              const done = currentIndex >= i;
              const current = currentIndex === i;
              return (
                <li key={s.key}>
                  <div
                    className={cx(
                      "h-1.5 rounded-full",
                      current ? "bg-amber-500" : done ? "bg-amber-300" : "bg-slate-200"
                    )}
                  />
                  <div
                    className={cx(
                      "mt-2 text-[11px] font-semibold uppercase tracking-wide",
                      current ? "text-amber-600" : done ? "text-amber-500/80" : "text-slate-400"
                    )}
                  >
                    {s.label}
                    {current ? " · current" : ""}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{s.at}</div>
                </li>
              );
            })}
          </ol>
          {run.status === "FAILED" && (
            <p className="mt-3 text-xs font-medium text-rose-600">
              This pay run failed and is no longer progressing through the workflow.
            </p>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Actions</h2>
          <PayRunActions run={{ id: run.id, label: run.label, status: run.status }} />
        </div>
      </div>

      {/* ── Cost mix + payslip summary ── */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Cost breakdown" subtitle="Gross, tax, super and net for this run">
          <Donut
            segments={mixSegments}
            size={132}
            thickness={16}
            centerValue={formatMoney(run.grossPay)}
            centerLabel="gross"
          />
        </ChartPanel>

        <ChartPanel title="Payslips" subtitle="Generation status for this run">
          <dl className="space-y-3 text-sm">
            {(["PENDING", "ISSUED", "VIEWED"] as const).map((s) => (
              <div key={s} className="flex items-center justify-between">
                <dt className="text-slate-500">{s.charAt(0) + s.slice(1).toLowerCase()}</dt>
                <dd>
                  <Badge tone={PAYSLIP_TONE[s] ?? "slate"}>{payslipCounts[s] ?? 0}</Badge>
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <dt className="text-slate-500">Total payslips</dt>
              <dd className="font-semibold text-slate-900">{run._count.payslips}</dd>
            </div>
          </dl>
        </ChartPanel>
      </div>

      {/* ── Lines ── */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Pay run lines</h2>
        {lines.length === 0 ? (
          <EmptyState
            title="No lines on this pay run yet"
            hint="Calculate the run to create a costed line for every active employee."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th text-right">Hours</th>
                  <th className="th text-right">Gross</th>
                  <th className="th text-right">Tax</th>
                  <th className="th text-right">Super</th>
                  <th className="th text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <div className="font-medium text-slate-800">
                        {l.employee.firstName} {l.employee.lastName}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {l.employee.employeeNumber}
                        {l.employee.department ? ` · ${l.employee.department.name}` : ""}
                      </div>
                    </td>
                    <td className="td text-right tabular-nums text-slate-600">
                      {Number(l.hoursWorked).toFixed(2)}
                    </td>
                    <td className="td text-right tabular-nums text-slate-600">
                      {formatMoney(l.grossPay)}
                    </td>
                    <td className="td text-right tabular-nums text-slate-600">
                      {formatMoney(l.taxAmount)}
                    </td>
                    <td className="td text-right tabular-nums text-slate-600">
                      {formatMoney(l.superAmount)}
                    </td>
                    <td className="td text-right font-medium tabular-nums text-slate-800">
                      {formatMoney(l.netPay)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {linePages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Page {page} of {linePages} · {lineCount} line{lineCount === 1 ? "" : "s"}
                </span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={`/payroll/pay-runs/${run.id}${qs({ page: page - 1 })}`}
                      className="btn-secondary !py-1.5 text-xs"
                    >
                      ← Previous
                    </Link>
                  )}
                  {page < linePages && (
                    <Link
                      href={`/payroll/pay-runs/${run.id}${qs({ page: page + 1 })}`}
                      className="btn-secondary !py-1.5 text-xs"
                    >
                      Next →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
