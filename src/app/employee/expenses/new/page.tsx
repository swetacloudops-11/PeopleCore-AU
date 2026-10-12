import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { PageHeader } from "@/components/ui";
import { ExpenseForm } from "./ExpenseForm";

export default async function SubmitExpensePage() {
  const { employee, organisationId } = await employeeContext();

  // Most-used claim categories in the organisation — top 10 as suggestions.
  const catRows = await prisma.expense.groupBy({
    by: ["category"],
    where: { organisationId },
    _count: true,
    orderBy: { _count: { category: "desc" } },
    take: 10,
  });

  return (
    <div>
      <PageHeader
        title="Submit Expense Claim"
        subtitle={`${employee.firstName}, log a work expense for reimbursement.`}
        action={{ label: "My Expense Claims", href: "/employee/expenses" }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ExpenseForm
            categories={catRows.map((c) => c.category)}
            today={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <aside className="card h-fit p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-800">How claims work</h3>
          <ol className="mt-3 space-y-3 text-[13px] text-slate-600">
            <li className="flex gap-2.5">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">
                1
              </span>
              Submit your claim — a receipt reference can be added now or later.
            </li>
            <li className="flex gap-2.5">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">
                2
              </span>
              Your manager reviews it. You can withdraw a pending claim any time.
            </li>
            <li className="flex gap-2.5">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">
                3
              </span>
              Approved claims are marked reimbursed once paid back to you.
            </li>
          </ol>
          <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-snug text-slate-400">
            Receipts are recorded by file name and size only — hand the original to your manager if
            they ask for it.
          </p>
        </aside>
      </div>
    </div>
  );
}
