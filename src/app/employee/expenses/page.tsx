import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext, qs, intParam, strParam } from "@/lib/employee";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment, type Tone } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";
import { ExpenseWithdraw } from "./ExpenseWithdraw";

const PAGE_SIZE = 20;

const STATUS_CHIPS = ["ALL", "DRAFT", "PENDING", "APPROVED", "REJECTED", "REIMBURSED"] as const;

/** Badge tones (separate from chart tones). */
const STATUS_TONE: Record<string, string> = {
  DRAFT: "blue",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  REIMBURSED: "purple",
};

/** Chart palette — distinct from Badge tones. */
const CHART_TONE: Record<string, Tone> = {
  DRAFT: "slate",
  PENDING: "amber",
  APPROVED: "emerald",
  REJECTED: "rose",
  REIMBURSED: "teal",
};

export default async function MyExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { employee, organisationId } = await employeeContext();

  const status = (strParam(sp.status) || "ALL").toUpperCase();
  const page = intParam(sp.page, 1);

  const where = {
    employeeId: employee.id,
    organisationId,
    ...(status !== "ALL" ? { status: status as never } : {}),
  };

  const [submittedCount, pendingCount, approvedAgg, reimbursedAgg, statusCounts, totalRows, claims] =
    await Promise.all([
      prisma.expense.count({
        where: { employeeId: employee.id, organisationId, status: { not: "DRAFT" } },
      }),
      prisma.expense.count({
        where: { employeeId: employee.id, organisationId, status: "PENDING" },
      }),
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { employeeId: employee.id, organisationId, status: "APPROVED" },
      }),
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { employeeId: employee.id, organisationId, status: "REIMBURSED" },
      }),
      prisma.expense.groupBy({
        by: ["status"],
        where: { employeeId: employee.id, organisationId },
        _count: true,
      }),
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        orderBy: [
          { submittedAt: { sort: "desc", nulls: "last" } },
          { expenseDate: "desc" },
        ],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const approvedTotal = Number(approvedAgg._sum.amount ?? 0);
  const reimbursedTotal = Number(reimbursedAgg._sum.amount ?? 0);
  const allCount = statusCounts.reduce((a, s) => a + s._count, 0);

  const statusSegments = (statusCounts
    .map((s) => ({
      label: s.status,
      value: s._count,
      tone: CHART_TONE[s.status] ?? "slate",
    }))
    .sort((a, b) => b.value - a.value)) as DonutSegment[];

  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/employee/expenses${qs({ status, page, ...overrides })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            My Expense Claims
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {employee.firstName} {employee.lastName} · {submittedCount} claim
            {submittedCount === 1 ? "" : "s"} submitted
          </p>
        </div>
        <Link href="/employee/expenses/new" className="btn-primary">
          + New claim
        </Link>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total submitted" value={submittedCount} hint="All time" tone="indigo" />
        <StatCard
          label="Pending"
          value={pendingCount}
          hint={pendingCount ? "Awaiting review" : "Nothing waiting"}
          tone={pendingCount ? "amber" : "emerald"}
        />
        <StatCard
          label="Approved total"
          value={formatMoney(approvedTotal)}
          hint="Waiting to be reimbursed"
          tone="emerald"
        />
        <StatCard label="Reimbursed total" value={formatMoney(reimbursedTotal)} hint="Paid back to you" tone="sky" />
      </div>

      {/* ── Status mix ── */}
      <div className="mt-5">
        <ChartPanel title="Claims by status" subtitle="Every claim you have lodged" className="max-w-md">
          <Donut
            segments={statusSegments}
            size={136}
            thickness={16}
            centerValue={allCount}
            centerLabel="claims"
          />
        </ChartPanel>
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        {STATUS_CHIPS.map((s) => {
          const activeChip = status === s;
          return (
            <Link
              key={s}
              href={pageHref({ status: s, page: 1 })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeChip ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s}
            </Link>
          );
        })}
      </div>

      {/* ── Claims table ── */}
      <div className="mt-4">
        {claims.length === 0 ? (
          <EmptyState
            title="No expense claims here yet"
            hint={
              status === "ALL"
                ? "Submit your first claim to get reimbursed for work expenses."
                : "Try a different status filter to see more claims."
            }
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Category</th>
                  <th className="th">Description</th>
                  <th className="th">Amount</th>
                  <th className="th">Status</th>
                  <th className="th">Submitted</th>
                  <th className="th">Receipt</th>
                  <th className="th">Review notes</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="td whitespace-nowrap text-slate-600">{formatDate(c.expenseDate)}</td>
                    <td className="td font-medium text-slate-700">{c.category}</td>
                    <td className="td max-w-[220px] truncate text-slate-600">{c.description}</td>
                    <td className="td whitespace-nowrap tabular-nums font-medium text-slate-800">
                      {formatMoney(Number(c.amount), c.currency)}
                    </td>
                    <td className="td">
                      <Badge tone={STATUS_TONE[c.status] ?? "slate"}>{c.status}</Badge>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {c.submittedAt ? formatDate(c.submittedAt) : "—"}
                    </td>
                    <td className="td max-w-[140px] truncate text-slate-500">
                      {c.receiptName ?? "—"}
                    </td>
                    <td className="td max-w-[180px] text-slate-500">
                      {c.reviewedAt ? (c.reviewNotes ?? "—") : "—"}
                    </td>
                    <td className="td text-right">
                      {c.status === "PENDING" ? (
                        <ExpenseWithdraw id={c.id} />
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {/* ── Pagination ── */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} of{" "}
                {totalRows}
                {status !== "ALL" ? " (filtered)" : ""}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={pageHref({ page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                    ← Previous
                  </Link>
                ) : (
                  <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                    ← Previous
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link href={pageHref({ page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                    Next →
                  </Link>
                ) : (
                  <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                    Next →
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
