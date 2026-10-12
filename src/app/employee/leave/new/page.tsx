import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { PageHeader } from "@/components/ui";
import { LeaveApplyForm, type LeaveTypeOption } from "./LeaveApplyForm";

export default async function ApplyForLeavePage() {
  const { employee, organisationId } = await employeeContext();
  const year = new Date().getFullYear();

  const [types, balances] = await Promise.all([
    prisma.leaveType.findMany({
      where: { organisationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, isPaid: true, colour: true },
    }),
    prisma.leaveBalance.findMany({
      where: { employeeId: employee.id, year },
      select: {
        leaveTypeId: true,
        entitlement: true,
        taken: true,
        pending: true,
        carriedOver: true,
      },
    }),
  ]);

  const byType = new Map(balances.map((b) => [b.leaveTypeId, b]));

  // Plain serialisable options — every Decimal is converted with Number().
  // available = entitlement + carriedOver − taken − pending
  const options: LeaveTypeOption[] = types.map((t) => {
    const b = byType.get(t.id);
    const available = b
      ? Number(b.entitlement) + Number(b.carriedOver) - Number(b.taken) - Number(b.pending)
      : 0;
    return {
      id: t.id,
      name: t.name,
      unit: t.unit,
      isPaid: t.isPaid,
      colour: t.colour,
      available: Math.round(available * 10) / 10,
    };
  });

  return (
    <div>
      <PageHeader
        title="Apply for Leave"
        subtitle={`${employee.firstName}, submit a request and your manager will review it.`}
        action={{ label: "My Leave Requests", href: "/employee/leave" }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LeaveApplyForm types={options} />
        </div>

        <aside className="card h-fit p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-800">Available balance</h3>
          <p className="mt-0.5 text-xs text-slate-400">Leave year {year}</p>
          <ul className="mt-4 space-y-3">
            {options.length === 0 && (
              <li className="text-sm text-slate-500">
                No active leave types are configured for your organisation yet.
              </li>
            )}
            {options.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-slate-600">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: /^#[0-9a-fA-F]{6}$/.test(t.colour) ? t.colour : "#94a3b8",
                    }}
                  />
                  <span className="truncate">{t.name}</span>
                  {!t.isPaid && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                      unpaid
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-slate-800">
                  {t.available.toFixed(1)}
                  {t.unit === "HOURS" ? "h" : "d"}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
