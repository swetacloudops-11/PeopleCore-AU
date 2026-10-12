import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, EmptyState, StatCard, TableWrap } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  PAID: "green",
  FAILED: "red",
};

export default async function PayrollReportsPage() {
  const { organisationId, org } = await orgContext();

  const [runs, lines] = await Promise.all([
    prisma.payRun.findMany({
      where: { organisationId },
      orderBy: { payDate: "desc" },
      select: {
        id: true,
        label: true,
        periodStart: true,
        periodEnd: true,
        payDate: true,
        status: true,
        employeeCount: true,
        grossPay: true,
        superAmount: true,
        taxAmount: true,
        netPay: true,
      },
    }),
    prisma.payRunLine.findMany({
      where: { payRun: { organisationId } },
      select: {
        grossPay: true,
        superAmount: true,
        employee: { select: { department: { select: { name: true } } } },
      },
    }),
  ]);

  const totals = runs.reduce(
    (acc, r) => ({
      gross: acc.gross + Number(r.grossPay),
      super: acc.super + Number(r.superAmount),
      tax: acc.tax + Number(r.taxAmount),
      net: acc.net + Number(r.netPay),
      staff: acc.staff + r.employeeCount,
    }),
    { gross: 0, super: 0, tax: 0, net: 0, staff: 0 }
  );

  // (a) payroll cost by department
  const byDept = new Map<string, { gross: number; super: number; staff: number }>();
  for (const l of lines) {
    const key = l.employee.department?.name ?? "Unassigned";
    const entry = byDept.get(key) ?? { gross: 0, super: 0, staff: 0 };
    entry.gross += Number(l.grossPay);
    entry.super += Number(l.superAmount);
    entry.staff += 1;
    byDept.set(key, entry);
  }
  const departments = [...byDept.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.gross - a.gross);
  const maxDept = departments[0]?.gross ?? 0;

  // (b) cost trend across the last N pay runs
  const trend = runs.slice(0, 8).reverse();
  const maxRun = Math.max(...trend.map((r) => Number(r.grossPay)), 0);

  const superShare = totals.gross ? (totals.super / totals.gross) * 100 : 0;
  const taxShare = totals.gross ? (totals.tax / totals.gross) * 100 : 0;
  const costPerHead = totals.staff ? totals.gross / totals.staff : 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Payroll reports
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · read-only payroll cost analytics across {runs.length} pay run
            {runs.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/org/payroll/pay-runs" className="btn-secondary">
          View pay runs
        </Link>
      </div>

      {runs.length === 0 ? (
        <EmptyState
          title="No payroll data yet"
          hint="Cost analytics appear once your first pay run is created."
        />
      ) : (
        <>
          {/* ── Headline totals ── */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Gross cost" value={formatMoney(totals.gross)} hint="All pay runs" tone="indigo" />
            <StatCard
              label="Super"
              value={formatMoney(totals.super)}
              hint={`${superShare.toFixed(1)}% of gross`}
              tone="emerald"
            />
            <StatCard
              label="Tax withheld"
              value={formatMoney(totals.tax)}
              hint={`${taxShare.toFixed(1)}% of gross`}
              tone="amber"
            />
            <StatCard
              label="Net paid"
              value={formatMoney(totals.net)}
              hint={`${formatMoney(costPerHead)} avg / employee`}
              tone="sky"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {/* ── (a) Cost by department ── */}
            <section className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">
                  Payroll cost by department
                </h2>
                <span className="text-[11px] text-slate-400">All pay runs · gross</span>
              </div>
              {departments.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  No costed lines yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {departments.map((d) => (
                    <li key={d.name}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-medium text-slate-700">{d.name}</span>
                        <span className="tabular-nums text-slate-500">
                          {formatMoney(d.gross)} · {d.staff} line
                          {d.staff === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{
                            width: `${maxDept ? Math.max(3, (d.gross / maxDept) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── (c) Super vs tax ── */}
            <section className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">
                  Super vs tax withholding
                </h2>
                <span className="text-[11px] text-slate-400">Share of gross pay</span>
              </div>

              <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${Math.min(100, superShare)}%` }}
                />
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${Math.min(100, taxShare)}%` }}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    Superannuation
                  </div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {formatMoney(totals.super)}
                  </div>
                  <div className="text-xs text-slate-500">{superShare.toFixed(1)}% of gross</div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    PAYG tax
                  </div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {formatMoney(totals.tax)}
                  </div>
                  <div className="text-xs text-slate-500">{taxShare.toFixed(1)}% of gross</div>
                </div>
              </div>

              <dl className="mt-4 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Total employer cost (gross + super)</dt>
                  <dd className="font-medium tabular-nums text-slate-800">
                    {formatMoney(totals.gross + totals.super)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Average cost per employee line</dt>
                  <dd className="font-medium tabular-nums text-slate-800">
                    {formatMoney(costPerHead)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          {/* ── (b) + (d) trend & headcount ── */}
          <section className="mt-4 card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                Cost trend across the last {trend.length} pay run
                {trend.length === 1 ? "" : "s"}
              </h2>
              <span className="text-[11px] text-slate-400">Bar = gross pay</span>
            </div>

            <div className="space-y-4">
              {trend.map((r) => {
                const gross = Number(r.grossPay);
                const width = maxRun ? Math.max(3, (gross / maxRun) * 100) : 0;
                const perHead = r.employeeCount ? gross / r.employeeCount : 0;
                return (
                  <div key={r.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                      <Link
                        href={`/org/payroll/pay-runs/${r.id}`}
                        className="font-medium text-slate-700 hover:text-indigo-600 hover:underline"
                      >
                        {r.label}
                      </Link>
                      <span className="flex items-center gap-2 text-slate-500">
                        <Badge tone={TONE[r.status] ?? "slate"}>
                          {r.status.replace("_", " ")}
                        </Badge>
                        <span className="tabular-nums">{formatMoney(gross)}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          r.status === "PAID"
                            ? "bg-emerald-500"
                            : r.status === "DRAFT"
                              ? "bg-slate-400"
                              : "bg-indigo-500"
                        }`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-slate-400">
                      <span>{formatDate(r.periodStart)} → {formatDate(r.periodEnd)}</span>
                      <span>{r.employeeCount} staff costed</span>
                      <span>{formatMoney(perHead)} / employee</span>
                      <span>Super {formatMoney(r.superAmount)}</span>
                      <span>Tax {formatMoney(r.taxAmount)}</span>
                      <span>Net {formatMoney(r.netPay)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Per-run table ── */}
          <div className="mt-4">
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Pay run</th>
                  <th className="th">Status</th>
                  <th className="th">Pay date</th>
                  <th className="th text-right">Headcount</th>
                  <th className="th text-right">Gross</th>
                  <th className="th text-right">Super</th>
                  <th className="th text-right">Tax</th>
                  <th className="th text-right">Net</th>
                  <th className="th text-right">Cost / employee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">{r.label}</td>
                    <td className="td">
                      <Badge tone={TONE[r.status] ?? "slate"}>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="td text-slate-500">{formatDate(r.payDate)}</td>
                    <td className="td text-right tabular-nums">{r.employeeCount}</td>
                    <td className="td text-right tabular-nums">{formatMoney(r.grossPay)}</td>
                    <td className="td text-right tabular-nums">{formatMoney(r.superAmount)}</td>
                    <td className="td text-right tabular-nums">{formatMoney(r.taxAmount)}</td>
                    <td className="td text-right font-medium tabular-nums text-slate-800">
                      {formatMoney(r.netPay)}
                    </td>
                    <td className="td text-right tabular-nums text-slate-500">
                      {r.employeeCount
                        ? formatMoney(Number(r.grossPay) / r.employeeCount)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="td font-semibold text-slate-800" colSpan={3}>
                    Totals
                  </td>
                  <td className="td text-right font-semibold tabular-nums text-slate-800">
                    {totals.staff}
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
          </div>
        </>
      )}
    </div>
  );
}
