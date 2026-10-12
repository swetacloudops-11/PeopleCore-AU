import Link from "next/link";
import { ExpenseStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { parseEnum } from "@/lib/enums";
import { Badge, TableWrap, EmptyState, StatCard } from "@/components/ui";
import { ChartPanel, Donut, BarList, type DonutSegment } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";
import { ExpenseRowActions, NewExpenseButton } from "./Actions";

export const dynamic = "force-dynamic";

const PAGE = 25;
const STATUSES = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "REIMBURSED"];

const TONE: Record<string, string> = {
  DRAFT: "slate",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  REIMBURSED: "blue",
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const q = strParam(sp.q);
  const page = intParam(sp.page, 1);
  const status = parseEnum(ExpenseStatus, sp.status);

  const where = {
    organisationId,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { description: { contains: q, mode: "insensitive" as const } },
            { category: { contains: q, mode: "insensitive" as const } },
            {
              employee: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" as const } },
                  { lastName: { contains: q, mode: "insensitive" as const } },
                  { employeeNumber: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [total, rows, counts, all, pending, approved, rejected, employees, byCategory] =
    await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * PAGE,
        take: PAGE,
        include: {
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
          reviewedBy: { select: { name: true, email: true } },
        },
      }),
      prisma.expense.groupBy({ by: ["status"], _count: true, where: { organisationId } }),
      prisma.expense.aggregate({
        where: { organisationId },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.expense.aggregate({
        where: { organisationId, status: "PENDING" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.expense.aggregate({
        where: { organisationId, status: { in: ["APPROVED", "REIMBURSED"] } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.expense.aggregate({
        where: { organisationId, status: "REJECTED" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.employee.findMany({
        where: { organisationId, employmentStatus: { in: ["ACTIVE", "PROBATION", "LEAVE"] } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      }),
      prisma.expense.groupBy({
        by: ["category"],
        _sum: { amount: true },
        _count: true,
        where: { organisationId },
        orderBy: { _sum: { amount: "desc" } },
        take: 7,
      }),
    ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = { q: q || undefined, status: sp.status || undefined };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Expenses
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · {all._count} claim{all._count === 1 ? "" : "s"} across your team
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/org/expenses/approvals" className="btn-secondary">
            Approvals queue
          </Link>
          <NewExpenseButton
            employees={employees.map((e) => ({
              id: e.id,
              name: `${e.firstName} ${e.lastName}`,
            }))}
          />
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total claimed"
          value={formatMoney(all._sum.amount ?? 0)}
          hint={`${all._count} claims all time`}
          tone="indigo"
        />
        <StatCard
          label="Pending value"
          value={formatMoney(pending._sum.amount ?? 0)}
          hint={`${pending._count} awaiting review`}
          tone={pending._count ? "amber" : "emerald"}
        />
        <StatCard
          label="Approved value"
          value={formatMoney(approved._sum.amount ?? 0)}
          hint={`${approved._count} approved or reimbursed`}
          tone="emerald"
        />
        <StatCard
          label="Rejected"
          value={rejected._count}
          hint={formatMoney(rejected._sum.amount ?? 0)}
          tone={rejected._count ? "rose" : "emerald"}
        />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Claims by status" subtitle="All expenses on record">
          <Donut
            segments={(
              [
                { label: "Pending", value: countMap.PENDING ?? 0, tone: "amber" },
                { label: "Approved", value: countMap.APPROVED ?? 0, tone: "emerald" },
                { label: "Reimbursed", value: countMap.REIMBURSED ?? 0, tone: "sky" },
                { label: "Rejected", value: countMap.REJECTED ?? 0, tone: "rose" },
                { label: "Draft", value: countMap.DRAFT ?? 0, tone: "slate" },
              ] as DonutSegment[]
            ).filter((s) => s.value > 0)}
            size={136}
            thickness={16}
            centerValue={totalAll}
            centerLabel="claims"
          />
        </ChartPanel>

        <ChartPanel title="Spend by category" subtitle="Total claimed amount, top categories">
          <BarList
            items={byCategory.map((c) => ({
              label: c.category,
              value: Number(c._sum.amount ?? 0),
              hint: `${c._count} claim${c._count === 1 ? "" : "s"}`,
            }))}
            valueFormat={(v) => formatMoney(v)}
          />
        </ChartPanel>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {["ALL", ...STATUSES].map((s) => (
          <Link
            key={s}
            href={qs({ ...base, status: s === "ALL" ? undefined : s, page: 1 })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              (sp.status ?? "ALL") === s
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "ALL" ? "All" : s} ·{" "}
            {s === "ALL" ? totalAll : countMap[s] ?? 0}
          </Link>
        ))}
      </div>

      {/* ── Search ── */}
      <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="exp-q">Search</label>
          <input
            id="exp-q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Employee, category or description…"
          />
        </div>
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No expenses found"
            hint="Clear the filters or lodge a new claim to get started."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Category</th>
                <th className="th">Description</th>
                <th className="th text-right">Amount</th>
                <th className="th">Expense date</th>
                <th className="th">Receipt</th>
                <th className="th">Status</th>
                <th className="th">Submitted</th>
                <th className="th">Reviewed</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">
                    {e.employee.firstName} {e.employee.lastName}
                    <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                      {e.employee.employeeNumber}
                    </span>
                  </td>
                  <td className="td">
                    <Badge tone="blue">{e.category}</Badge>
                  </td>
                  <td className="td max-w-[16rem] truncate text-slate-600">
                    {e.description}
                  </td>
                  <td className="td text-right font-medium tabular-nums text-slate-800">
                    {formatMoney(e.amount)}
                    <span className="ml-1 text-[11px] font-normal text-slate-400">
                      {e.currency}
                    </span>
                  </td>
                  <td className="td text-slate-500">{formatDate(e.expenseDate)}</td>
                  <td className="td max-w-[9rem] truncate text-slate-500">
                    {e.receiptName ?? "—"}
                  </td>
                  <td className="td">
                    <Badge tone={TONE[e.status] ?? "slate"}>{e.status}</Badge>
                    {e.reviewNotes && (
                      <div className="mt-0.5 max-w-[12rem] truncate text-[11px] text-slate-400">
                        {e.reviewNotes}
                      </div>
                    )}
                  </td>
                  <td className="td text-slate-500">
                    {e.submittedAt ? formatDate(e.submittedAt) : "—"}
                  </td>
                  <td className="td text-slate-500">
                    {e.reviewedAt
                      ? `${e.reviewedBy?.name ?? e.reviewedBy?.email ?? "Admin"} · ${formatDate(e.reviewedAt)}`
                      : "—"}
                  </td>
                  <td className="td">
                    <ExpenseRowActions
                      expense={{
                        id: e.id,
                        employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
                        employeeId: e.employeeId,
                        category: e.category,
                        description: e.description,
                        amount: Number(e.amount),
                        currency: e.currency,
                        expenseDate: e.expenseDate,
                        receiptName: e.receiptName,
                        status: e.status,
                        reviewNotes: e.reviewNotes,
                        submittedAt: e.submittedAt,
                        reviewedAt: e.reviewedAt,
                        reimbursedAt: e.reimbursedAt,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {pages} · {total} claims
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ ...base, page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                ← Previous
              </Link>
            )}
            {page < pages && (
              <Link href={qs({ ...base, page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
