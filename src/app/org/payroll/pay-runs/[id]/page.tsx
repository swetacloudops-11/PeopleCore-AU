import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, TableWrap, EmptyState } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney, cx } from "@/lib/format";

export const dynamic = "force-dynamic";

const ORDER = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID"];

const TONE: Record<string, string> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  PAID: "green",
  FAILED: "red",
};

function BreakdownCell({ value }: { value: unknown }) {
  if (!Array.isArray(value) || value.length === 0) {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <ul className="min-w-[12rem] space-y-0.5">
      {value.map((item, i) => {
        const rec = (
          typeof item === "object" && item !== null ? item : {}
        ) as Record<string, unknown>;
        const label = String(rec.label ?? rec.name ?? rec.code ?? `Item ${i + 1}`);
        const raw = rec.amount ?? rec.value;
        const amount =
          typeof raw === "number"
            ? raw
            : typeof raw === "string"
              ? Number(raw)
              : NaN;
        return (
          <li key={i} className="flex items-baseline justify-between gap-4">
            <span className="truncate text-[11px] text-slate-500">{label}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-slate-600">
              {Number.isNaN(amount) ? "—" : formatMoney(amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function PayRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organisationId, org } = await orgContext();

  const run = await prisma.payRun.findFirst({
    where: { id, organisationId },
    include: {
      paySchedule: { select: { name: true, frequency: true } },
      _count: { select: { lines: true, payslips: true } },
    },
  });
  if (!run) notFound();

  const lines = await prisma.payRunLine.findMany({
    where: { payRunId: run.id },
    orderBy: { employee: { lastName: "asc" } },
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          employeeNumber: true,
          department: { select: { name: true } },
        },
      },
    },
  });

  const totals = lines.reduce(
    (acc, l) => ({
      hours: acc.hours + Number(l.hoursWorked),
      gross: acc.gross + Number(l.grossPay),
      super: acc.super + Number(l.superAmount),
      tax: acc.tax + Number(l.taxAmount),
      net: acc.net + Number(l.netPay),
    }),
    { hours: 0, gross: 0, super: 0, tax: 0, net: 0 }
  );

  const currentIndex = run.status === "FAILED" ? -1 : ORDER.indexOf(run.status);
  const steps = [
    { key: "DRAFT", label: "Draft created", at: formatDate(run.createdAt) },
    {
      key: "PENDING_APPROVAL",
      label: "Submitted",
      at: currentIndex >= 1 ? "Awaiting approval" : "—",
    },
    { key: "APPROVED", label: "Approved", at: run.approvedAt ? formatDateTime(run.approvedAt) : "—" },
    { key: "PAID", label: "Paid", at: run.paidAt ? formatDateTime(run.paidAt) : "—" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/org/payroll/pay-runs" className="text-sm text-indigo-600 hover:underline">
          ← Pay runs
        </Link>
        <Badge tone={TONE[run.status] ?? "slate"}>{run.status.replace("_", " ")}</Badge>
      </div>

      {/* ── Header ── */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {run.label}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {org.name} · {formatDate(run.periodStart)} → {formatDate(run.periodEnd)} ·
              pay date {formatDate(run.payDate)}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>
              Schedule:{" "}
              <span className="font-medium text-slate-700">
                {run.paySchedule
                  ? `${run.paySchedule.name} (${run.paySchedule.frequency})`
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

        {/* ── Status timeline ── */}
        <ol className="mt-5 grid gap-3 sm:grid-cols-4">
          {steps.map((s, i) => {
            const done = currentIndex >= i;
            return (
              <li key={s.key}>
                <div
                  className={cx(
                    "h-1 rounded-full",
                    done ? "bg-indigo-500" : "bg-slate-200"
                  )}
                />
                <div
                  className={cx(
                    "mt-2 text-[11px] font-semibold uppercase tracking-wide",
                    done ? "text-indigo-600" : "text-slate-400"
                  )}
                >
                  {s.label}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{s.at}</div>
              </li>
            );
          })}
        </ol>
        {run.status === "FAILED" && (
          <p className="mt-3 text-xs font-medium text-rose-600">
            This pay run failed — review the lines and recreate it as a draft.
          </p>
        )}
      </div>

      {/* ── Header totals ── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Employees", value: String(run.employeeCount) },
          { label: "Gross pay", value: formatMoney(run.grossPay) },
          { label: "Super", value: formatMoney(run.superAmount) },
          { label: "Tax withheld", value: formatMoney(run.taxAmount) },
          { label: "Net pay", value: formatMoney(run.netPay) },
        ].map((t) => (
          <div key={t.label} className="card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t.label}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
              {t.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Lines ── */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Pay run lines</h2>
        {lines.length === 0 ? (
          <EmptyState
            title="No lines on this pay run yet"
            hint="Draft runs have no costed lines until they are generated from timesheets and salaries."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Department</th>
                <th className="th text-right">Hours</th>
                <th className="th text-right">Gross</th>
                <th className="th text-right">Super</th>
                <th className="th text-right">Tax</th>
                <th className="th text-right">Net</th>
                <th className="th">Breakdown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">
                    {l.employee.firstName} {l.employee.lastName}
                    <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                      {l.employee.employeeNumber}
                    </span>
                  </td>
                  <td className="td text-slate-500">
                    {l.employee.department?.name ?? "—"}
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {Number(l.hoursWorked).toFixed(2)}
                  </td>
                  <td className="td text-right tabular-nums">{formatMoney(l.grossPay)}</td>
                  <td className="td text-right tabular-nums">{formatMoney(l.superAmount)}</td>
                  <td className="td text-right tabular-nums">{formatMoney(l.taxAmount)}</td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(l.netPay)}
                  </td>
                  <td className="td">
                    <BreakdownCell value={l.breakdown} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="td font-semibold text-slate-800" colSpan={2}>
                  Totals · {lines.length} employee{lines.length === 1 ? "" : "s"}
                </td>
                <td className="td text-right font-semibold tabular-nums text-slate-800">
                  {totals.hours.toFixed(2)}
                </td>
                <td className="td text-right font-semibold tabular-nums text-slate-800">
                  {formatMoney(totals.gross)}
                </td>
                <td className="td text-right font-semibold tabular-nums text-slate-800">
                  {formatMoney(totals.super)}
                </td>
                <td className="td text-right font-semibold tabular-nums text-slate-800">
                  {formatMoney(totals.tax)}
                </td>
                <td className="td text-right font-semibold tabular-nums text-slate-800">
                  {formatMoney(totals.net)}
                </td>
                <td className="td" />
              </tr>
            </tfoot>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
