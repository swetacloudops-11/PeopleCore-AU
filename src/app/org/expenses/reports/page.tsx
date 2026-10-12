import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext, intParam } from "@/lib/org";
import { Badge, TableWrap, EmptyState, StatCard } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE = 25;

const TONE: Record<string, string> = {
  DRAFT: "slate",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  REIMBURSED: "blue",
};

export default async function ExpenseReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();
  const page = intParam(sp.page, 1);

  // "Current period" = the calendar month we are in (UTC boundaries so the
  // month's first and last day line up with the stored @db.Date values).
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
  const periodScope = {
    organisationId,
    expenseDate: { gte: periodStart, lte: periodEnd },
  };

  const [total, reports, counts, reportTotals, categoryRows, expenseRows] =
    await Promise.all([
      prisma.expenseReport.count({ where: { organisationId } }),
      prisma.expenseReport.findMany({
        where: { organisationId },
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * PAGE,
        take: PAGE,
        include: {
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        },
      }),
      prisma.expenseReport.groupBy({
        by: ["status"],
        _count: true,
        where: { organisationId },
      }),
      prisma.expenseReport.aggregate({
        where: { organisationId },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.expense.groupBy({
        by: ["category"],
        where: periodScope,
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: "desc" } },
      }),
      prisma.expense.findMany({
        where: periodScope,
        select: {
          amount: true,
          employee: { select: { department: { select: { name: true } } } },
        },
      }),
    ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const pages = Math.max(1, Math.ceil(total / PAGE));

  // (b) spend by department for the current period
  const byDept = new Map<string, { amount: number; count: number }>();
  for (const e of expenseRows) {
    const key = e.employee.department?.name ?? "Unassigned";
    const entry = byDept.get(key) ?? { amount: 0, count: 0 };
    entry.amount += Number(e.amount);
    entry.count += 1;
    byDept.set(key, entry);
  }
  const departments = [...byDept.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.amount - a.amount);

  const periodSpend = expenseRows.reduce((sum, e) => sum + Number(e.amount), 0);
  const maxCategory = categoryRows[0]?._sum.amount ?? 0;
  const maxDept = departments[0]?.amount ?? 0;
  const periodLabel = periodStart.toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Expense reports
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · grouped claims and spend analysis for {periodLabel}
          </p>
        </div>
        <Link href="/org/expenses" className="btn-secondary">
          All expenses
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Reports"
          value={reportTotals._count}
          hint={`${countMap.PENDING ?? 0} pending · ${countMap.APPROVED ?? 0} approved`}
          tone="indigo"
        />
        <StatCard
          label="Reported value"
          value={formatMoney(reportTotals._sum.totalAmount ?? 0)}
          hint="Across all reports"
          tone="sky"
        />
        <StatCard
          label={`${periodLabel} spend`}
          value={formatMoney(periodSpend)}
          hint={`${expenseRows.length} claim${expenseRows.length === 1 ? "" : "s"} this month`}
          tone="amber"
        />
        <StatCard
          label="Departments spending"
          value={departments.length}
          hint="With claims this period"
          tone="emerald"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* ── (a) spend by category ── */}
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Spend by category
            </h2>
            <span className="text-[11px] text-slate-400">{periodLabel}</span>
          </div>
          {categoryRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No expenses recorded this period.
            </p>
          ) : (
            <ul className="space-y-3">
              {categoryRows.map((c) => {
                const amount = Number(c._sum.amount ?? 0);
                return (
                  <li key={c.category}>
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-700">{c.category}</span>
                      <span className="tabular-nums text-slate-500">
                        {formatMoney(amount)} · {c._count} claim
                        {c._count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{
                          width: `${
                            Number(maxCategory)
                              ? Math.max(3, (amount / Number(maxCategory)) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── (b) spend by department ── */}
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Spend by department
            </h2>
            <span className="text-[11px] text-slate-400">{periodLabel}</span>
          </div>
          {departments.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No expenses recorded this period.
            </p>
          ) : (
            <ul className="space-y-3">
              {departments.map((d) => (
                <li key={d.name}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-medium text-slate-700">{d.name}</span>
                    <span className="tabular-nums text-slate-500">
                      {formatMoney(d.amount)} · {d.count} claim
                      {d.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: `${
                          maxDept ? Math.max(3, (d.amount / maxDept) * 100) : 0
                        }%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Reports list ── */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">All reports</h2>
        {reports.length === 0 ? (
          <EmptyState
            title="No expense reports yet"
            hint="Reports group several claims into a single submission for a period."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Report</th>
                <th className="th">Employee</th>
                <th className="th">Period</th>
                <th className="th text-right">Items</th>
                <th className="th text-right">Total</th>
                <th className="th">Status</th>
                <th className="th">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">
                    {r.name}
                    {r.notes && (
                      <div className="max-w-[18rem] truncate text-[11px] font-normal text-slate-400">
                        {r.notes}
                      </div>
                    )}
                  </td>
                  <td className="td text-slate-600">
                    {r.employee.firstName} {r.employee.lastName}
                    <span className="ml-1.5 text-[11px] text-slate-400">
                      {r.employee.employeeNumber}
                    </span>
                  </td>
                  <td className="td text-slate-500">
                    {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">
                    {r.itemCount}
                  </td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(r.totalAmount)}
                  </td>
                  <td className="td">
                    <Badge tone={TONE[r.status] ?? "slate"}>{r.status}</Badge>
                  </td>
                  <td className="td text-slate-500">{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {pages} · {total} reports
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/org/expenses/reports?page=${page - 1}`} className="btn-secondary !py-1.5 text-xs">
                ← Previous
              </Link>
            )}
            {page < pages && (
              <Link href={`/org/expenses/reports?page=${page + 1}`} className="btn-secondary !py-1.5 text-xs">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
