import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { EmptyState, StatCard } from "@/components/ui";
import { formatMoney, timeAgo } from "@/lib/format";
import ApprovalQueue from "./ApprovalQueue";

export const dynamic = "force-dynamic";

export default async function ExpenseApprovalsPage() {
  const { organisationId, org } = await orgContext();

  const [pending, pendingTotals, recentlyDecided] = await Promise.all([
    prisma.expense.findMany({
      where: { organisationId, status: "PENDING" },
      orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
      },
    }),
    prisma.expense.aggregate({
      where: { organisationId, status: "PENDING" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.expense.findMany({
      where: { organisationId, status: { in: ["APPROVED", "REJECTED"] } },
      orderBy: { reviewedAt: "desc" },
      take: 5,
      include: {
        employee: { select: { firstName: true, lastName: true } },
        reviewedBy: { select: { name: true, email: true } },
      },
    }),
  ]);

  const totalValue = Number(pendingTotals._sum.amount ?? 0);
  const oldest = pending[0]?.submittedAt ?? pending[0]?.createdAt ?? null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Pending expense approvals
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · decide on claims in one pass
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/org/expenses" className="btn-secondary">
            All expenses
          </Link>
          <Link href="/org/expenses/reports" className="btn-secondary">
            Expense reports
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Pending value"
          value={formatMoney(totalValue)}
          hint="Waiting on a decision"
          tone={pending.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Claims waiting"
          value={pending.length}
          hint="PENDING status"
          tone={pending.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Average claim"
          value={pending.length ? formatMoney(totalValue / pending.length) : "—"}
          hint="Across the queue"
          tone="indigo"
        />
        <StatCard
          label="Oldest waiting"
          value={oldest ? timeAgo(oldest) : "—"}
          hint={oldest ? "Since submission" : "Queue is clear"}
          tone={oldest ? "rose" : "emerald"}
        />
      </div>

      <div className="mt-6">
        {pending.length === 0 ? (
          <EmptyState
            title="Nothing waiting for approval"
            hint="New claims appear here as employees submit them."
          />
        ) : (
          <ApprovalQueue
            totalValue={totalValue}
            items={pending.map((e) => ({
              id: e.id,
              employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
              employeeNumber: e.employee.employeeNumber,
              category: e.category,
              description: e.description,
              amount: Number(e.amount),
              currency: e.currency,
              expenseDate: e.expenseDate,
              receiptName: e.receiptName,
              submittedAt: e.submittedAt,
            }))}
          />
        )}
      </div>

      {recentlyDecided.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Recent decisions</h2>
          <div className="card divide-y divide-slate-100">
            {recentlyDecided.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
              >
                <div className="text-slate-700">
                  <span className="font-medium">{e.employee.firstName} {e.employee.lastName}</span>
                  <span className="text-slate-400"> · {e.description}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="tabular-nums">{formatMoney(e.amount)}</span>
                  <span
                    className={
                      e.status === "APPROVED" ? "text-emerald-600" : "text-rose-600"
                    }
                  >
                    {e.status}
                  </span>
                  <span>
                    {e.reviewedBy?.name ?? e.reviewedBy?.email ?? "Admin"}
                    {e.reviewedAt ? ` · ${timeAgo(e.reviewedAt)}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
