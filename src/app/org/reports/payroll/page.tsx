import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatMoney, cx } from "@/lib/format";

export const dynamic = "force-dynamic";

const n = (v: { toString(): string } | null | undefined) =>
  v === null || v === undefined ? 0 : Number(v);

export default async function PayrollReportsPage() {
  const { organisationId } = await orgContext();

  const [payRuns, lines] = await Promise.all([
    prisma.payRun.findMany({
      where: { organisationId },
      orderBy: { payDate: "asc" },
      select: {
        id: true,
        label: true,
        payDate: true,
        periodStart: true,
        periodEnd: true,
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
        taxAmount: true,
        netPay: true,
        hoursWorked: true,
        employee: {
          select: {
            departmentId: true,
            department: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  // ── Totals across runs ──
  const totals = payRuns.reduce(
    (acc, r) => ({
      gross: acc.gross + n(r.grossPay),
      super: acc.super + n(r.superAmount),
      tax: acc.tax + n(r.taxAmount),
      net: acc.net + n(r.netPay),
      headcount: acc.headcount + r.employeeCount,
    }),
    { gross: 0, super: 0, tax: 0, net: 0, headcount: 0 }
  );

  const costedHeadcount = new Set(
    lines.map((l) => l.employee.departmentId ?? "unknown")
  ).size;
  const distinctEmployees = lines.length;
  const avgCostPerLine = distinctEmployees ? totals.gross / distinctEmployees : 0;

  // ── Cost by department (from PayRunLine × Employee.department) ──
  const byDept = new Map<string, { gross: number; super: number; tax: number; lines: number }>();
  for (const l of lines) {
    const key = l.employee.departmentId ?? "none";
    const cur = byDept.get(key) ?? { gross: 0, super: 0, tax: 0, lines: 0 };
    cur.gross += n(l.grossPay);
    cur.super += n(l.superAmount);
    cur.tax += n(l.taxAmount);
    cur.lines += 1;
    byDept.set(key, cur);
  }
  const deptRows = [...byDept.entries()]
    .map(([id, v]) => ({
      id,
      name: id === "none" ? "Unassigned" : (lines.find((l) => (l.employee.departmentId ?? "none") === id)?.employee.department?.name ?? "Unknown"),
      ...v,
    }))
    .sort((a, b) => b.gross - a.gross);
  const maxDeptGross = Math.max(1, ...deptRows.map((d) => d.gross));

  // ── Trend per pay run ──
  const trend = payRuns.map((r) => ({
    id: r.id,
    label: r.label,
    payDate: r.payDate,
    status: r.status,
    gross: n(r.grossPay),
    super: n(r.superAmount),
    tax: n(r.taxAmount),
    net: n(r.netPay),
    employeeCount: r.employeeCount,
  }));
  const maxGross = Math.max(1, ...trend.map((t) => t.gross));

  const paidRuns = payRuns.filter((r) => r.status === "PAID" || r.status === "APPROVED");

  return (
    <div>
      <PageHeader
        title="Payroll Reports"
        subtitle="Cost by department, run trend, super and tax totals — read-only."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Gross payroll"
          value={formatMoney(totals.gross)}
          hint={`${payRuns.length} pay runs`}
          tone="indigo"
        />
        <StatCard label="Superannuation" value={formatMoney(totals.super)} hint="Employer contributions" tone="sky" />
        <StatCard label="PAYG tax" value={formatMoney(totals.tax)} hint={`Net ${formatMoney(totals.net)}`} tone="amber" />
        <StatCard
          label="Avg cost / employee"
          value={formatMoney(avgCostPerLine)}
          hint={`${distinctEmployees} line items costed`}
          tone="emerald"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Cost by department ── */}
        <div className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Payroll cost by department</h2>
          {deptRows.length === 0 ? (
            <EmptyState title="No payroll lines yet" hint="Run a pay run to populate this report." />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Department</th>
                  <th className="th">Line items</th>
                  <th className="th">Gross</th>
                  <th className="th">Super</th>
                  <th className="th">Tax</th>
                  <th className="th">Share of gross</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deptRows.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">{d.name}</td>
                    <td className="td tabular-nums text-slate-700">{d.lines}</td>
                    <td className="td font-medium tabular-nums text-slate-800">
                      {formatMoney(d.gross)}
                    </td>
                    <td className="td tabular-nums text-slate-600">{formatMoney(d.super)}</td>
                    <td className="td tabular-nums text-slate-600">{formatMoney(d.tax)}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${Math.round((d.gross / maxDeptGross) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-slate-500">
                          {totals.gross ? Math.round((d.gross / totals.gross) * 100) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>

        {/* ── Cost per pay run trend ── */}
        <div className="card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Cost per pay run</h2>
            <span className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-indigo-500" /> Gross
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Net
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-amber-500" /> Super
              </span>
            </span>
          </div>
          {trend.length === 0 ? (
            <EmptyState title="No pay runs yet" />
          ) : (
            <>
              <div className="flex h-48 items-end gap-3">
                {trend.map((t) => (
                  <div key={t.id} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] tabular-nums text-slate-400">
                      {(t.gross / 1000).toFixed(1)}k
                    </span>
                    <div className="flex h-36 w-full items-end justify-center gap-0.5">
                      <div
                        className="w-1/3 rounded-t bg-indigo-500"
                        style={{ height: `${(t.gross / maxGross) * 100}%` }}
                        title={`Gross ${formatMoney(t.gross)}`}
                      />
                      <div
                        className="w-1/3 rounded-t bg-emerald-500"
                        style={{ height: `${(t.net / maxGross) * 100}%` }}
                        title={`Net ${formatMoney(t.net)}`}
                      />
                      <div
                        className="w-1/3 rounded-t bg-amber-500"
                        style={{ height: `${(t.super / maxGross) * 100}%` }}
                        title={`Super ${formatMoney(t.super)}`}
                      />
                    </div>
                    <span className="text-[9px] text-slate-400">{formatDate(t.payDate)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Run</th>
                      <th className="th">Pay date</th>
                      <th className="th">Status</th>
                      <th className="th">Staff</th>
                      <th className="th">Gross</th>
                      <th className="th">Super</th>
                      <th className="th">Tax</th>
                      <th className="th">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trend.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/70">
                        <td className="td font-medium text-slate-800">{t.label}</td>
                        <td className="td whitespace-nowrap text-slate-600">
                          {formatDate(t.payDate)}
                        </td>
                        <td className="td">
                          <Badge
                            tone={
                              t.status === "PAID"
                                ? "green"
                                : t.status === "APPROVED"
                                ? "blue"
                                : t.status === "FAILED"
                                ? "red"
                                : "amber"
                            }
                          >
                            {t.status}
                          </Badge>
                        </td>
                        <td className="td tabular-nums text-slate-700">{t.employeeCount}</td>
                        <td className="td tabular-nums text-slate-800">{formatMoney(t.gross)}</td>
                        <td className="td tabular-nums text-slate-600">{formatMoney(t.super)}</td>
                        <td className="td tabular-nums text-slate-600">{formatMoney(t.tax)}</td>
                        <td className="td tabular-nums text-slate-700">{formatMoney(t.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Super vs tax totals ── */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-800">Super vs tax</h3>
          <div className="mt-3 space-y-3">
            {[
              { label: "Super", value: totals.super, tone: "bg-sky-500" },
              { label: "PAYG tax", value: totals.tax, tone: "bg-amber-500" },
              { label: "Net pay", value: totals.net, tone: "bg-emerald-500" },
            ].map((row) => {
              const denom = Math.max(1, totals.gross);
              const pct = Math.round((row.value / denom) * 100);
              return (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-500">{row.label}</span>
                    <span className="font-medium tabular-nums text-slate-700">
                      {formatMoney(row.value)} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${row.tone}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-800">Headcount costed</h3>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{totals.headcount}</div>
          <p className="mt-1 text-xs text-slate-500">
            Total employee-slots paid across {payRuns.length} runs ({paidRuns.length} approved or
            paid).
          </p>
          <p className="mt-3 text-xs text-slate-500">
            {distinctEmployees} line items · {costedHeadcount} departments receiving pay.
          </p>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-800">Cost distribution</h3>
          <div className="mt-3 space-y-2">
            {deptRows.slice(0, 5).map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs">
                <span className="truncate text-slate-600">{d.name}</span>
                <span
                  className={cx(
                    "ml-2 shrink-0 font-medium tabular-nums",
                    d.gross === maxDeptGross ? "text-indigo-600" : "text-slate-700"
                  )}
                >
                  {totals.gross ? Math.round((d.gross / totals.gross) * 100) : 0}%
                </span>
              </div>
            ))}
            {deptRows.length === 0 && <p className="text-xs text-slate-400">No data yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
