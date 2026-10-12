import { prisma } from "@/lib/prisma";
import { orgContext, strParam } from "@/lib/org";
import { TableWrap, EmptyState, StatCard } from "@/components/ui";
import { ChartPanel, BarList, StackedBar } from "@/components/charts";
import BalanceEditor from "./Actions";

export const dynamic = "force-dynamic";

const YEAR = new Date().getFullYear();

export default async function LeaveBalancesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const q = strParam(sp.q);
  const typeFilter = strParam(sp.type);

  const [employees, leaveTypes, balances] = await Promise.all([
    prisma.employee.findMany({
      where: {
        organisationId,
        employmentStatus: { in: ["ACTIVE", "PROBATION", "LEAVE"] },
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" as const } },
                { lastName: { contains: q, mode: "insensitive" as const } },
                { employeeNumber: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 80,
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.leaveType.findMany({
      where: { organisationId, isActive: true, ...(typeFilter ? { id: typeFilter } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, colour: true },
    }),
    prisma.leaveBalance.findMany({
      where: {
        organisationId,
        year: YEAR,
        ...(typeFilter ? { leaveTypeId: typeFilter } : {}),
      },
      select: {
        id: true,
        employeeId: true,
        leaveTypeId: true,
        entitlement: true,
        taken: true,
        pending: true,
        carriedOver: true,
        leaveType: { select: { name: true, colour: true } },
        employee: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const employeeIds = new Set(employees.map((e) => e.id));
  const byKey = new Map<string, (typeof balances)[number]>();
  for (const b of balances) {
    if (employeeIds.has(b.employeeId)) byKey.set(`${b.employeeId}:${b.leaveTypeId}`, b);
  }

  const totals = balances.reduce(
    (acc, b) => {
      const ent = Number(b.entitlement);
      const carried = Number(b.carriedOver);
      const taken = Number(b.taken);
      const pending = Number(b.pending);
      acc.entitlement += ent;
      acc.available += ent + carried - taken - pending;
      return acc;
    },
    { entitlement: 0, available: 0 }
  );

  const num = (v: unknown) => Number(v);
  const covered = new Set(balances.map((b) => b.employeeId)).size;

  // ── chart data ──
  const takenTotal = balances.reduce((a, b) => a + num(b.taken), 0);
  const pendingTotal = balances.reduce((a, b) => a + num(b.pending), 0);
  const carriedTotal = balances.reduce((a, b) => a + num(b.carriedOver), 0);

  const takerMap = new Map<string, { name: string; taken: number }>();
  for (const b of balances) {
    const key = b.employeeId;
    const cur = takerMap.get(key) ?? {
      name: `${b.employee.firstName} ${b.employee.lastName}`,
      taken: 0,
    };
    cur.taken += num(b.taken);
    takerMap.set(key, cur);
  }
  const topTakers = [...takerMap.values()]
    .filter((t) => t.taken > 0)
    .sort((a, b) => b.taken - a.taken)
    .slice(0, 8)
    .map((t) => ({ label: t.name, value: Math.round(t.taken * 10) / 10 }));

  const colourByName = new Map<string, string>();
  for (const b of balances) colourByName.set(b.leaveType.name, b.leaveType.colour);
  const typeMap = new Map<string, number>();
  for (const b of balances) {
    typeMap.set(b.leaveType.name, (typeMap.get(b.leaveType.name) ?? 0) + num(b.taken));
  }
  const takenByType = [...typeMap.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([label, value]) => ({
      label,
      value: Math.round(value * 10) / 10,
      color: colourByName.get(label),
    }));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Leave balances · {YEAR}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · entitlement, taken, pending, carried over and available leave per employee
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Employees" value={employees.length} hint="Active profiles" tone="indigo" />
        <StatCard label="Balances tracked" value={balances.length} hint={`Year ${YEAR}`} tone="sky" />
        <StatCard label="Total entitlement" value={`${totals.entitlement.toFixed(1)}d`} hint="Before deductions" tone="emerald" />
        <StatCard
          label="Available now"
          value={`${totals.available.toFixed(1)}d`}
          hint="Entitlement + carried − taken − pending"
          tone={totals.available < 0 ? "rose" : "amber"}
        />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <ChartPanel title="Leave liability" subtitle={`Year ${YEAR} · days`}>
          <StackedBar
            segments={[
              { label: "Taken", value: Math.round(takenTotal * 10) / 10, tone: "rose" },
              { label: "Pending", value: Math.round(pendingTotal * 10) / 10, tone: "amber" },
              { label: "Carried over", value: Math.round(carriedTotal * 10) / 10, tone: "sky" },
              {
                label: "Available",
                value: Math.max(0, Math.round(totals.available * 10) / 10),
                tone: "emerald",
              },
            ]}
            height={14}
          />
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            {takenTotal.toFixed(1)} days used, {pendingTotal.toFixed(1)} pending against{" "}
            {totals.entitlement.toFixed(1)} days of entitlement.
          </p>
        </ChartPanel>

        <ChartPanel title="Top leave takers" subtitle="Days taken this year">
          <BarList
            items={topTakers}
            tone="rose"
            valueFormat={(v) => `${v}d`}
            showPercents={false}
          />
        </ChartPanel>

        <ChartPanel title="Taken by leave type" subtitle="Where the days went">
          <BarList
            items={takenByType}
            valueFormat={(v) => `${v}d`}
            showPercents={false}
          />
        </ChartPanel>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <form method="GET" className="flex flex-1 flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label className="label" htmlFor="lb-q">Employee</label>
            <input
              id="lb-q"
              name="q"
              defaultValue={q}
              className="input"
              placeholder="Search by name or employee number…"
            />
          </div>
          <div>
            <label className="label" htmlFor="lb-type">Leave type</label>
            <select id="lb-type" name="type" defaultValue={typeFilter} className="input min-w-[12rem]">
              <option value="">All leave types</option>
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary">Filter</button>
        </form>
      </div>

      <div className="mt-4">
        {employees.length === 0 ? (
          <EmptyState title="No employees match that search" />
        ) : leaveTypes.length === 0 ? (
          <EmptyState title="No leave types configured" hint="Add leave types in Settings → Leave Rules." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                {leaveTypes.map((t) => (
                  <th key={t.id} className="th">
                    <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: t.colour }}
                      />
                      {t.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/70">
                  <td className="td whitespace-nowrap font-medium text-slate-800">
                    {e.firstName} {e.lastName}
                    <span className="ml-1.5 text-[11px] text-slate-400">{e.employeeNumber}</span>
                  </td>
                  {leaveTypes.map((t) => {
                    const b = byKey.get(`${e.id}:${t.id}`);
                    if (!b) {
                      return (
                        <td key={t.id} className="td text-center text-slate-300">
                          —
                        </td>
                      );
                    }
                    const ent = num(b.entitlement);
                    const taken = num(b.taken);
                    const pending = num(b.pending);
                    const carried = num(b.carriedOver);
                    const available = ent + carried - taken - pending;
                    return (
                      <td key={t.id} className="td min-w-[13rem]">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                                Available
                              </span>
                              <span
                                className={`text-sm font-semibold tabular-nums ${
                                  available <= 0 ? "text-rose-600" : "text-slate-800"
                                }`}
                              >
                                {available.toFixed(1)}d
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                              Ent {ent.toFixed(1)} · Tak {taken.toFixed(1)} · Pend{" "}
                              {pending.toFixed(1)} · Carry {carried.toFixed(1)}
                            </div>
                          </div>
                          <BalanceEditor
                            balance={{
                              id: b.id,
                              label: `${b.employee.firstName} ${b.employee.lastName} · ${b.leaveType.name} · ${YEAR}`,
                              entitlement: ent,
                              taken,
                              pending,
                              carriedOver: carried,
                            }}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Available = entitlement + carried over − taken − pending. Showing {employees.length}{" "}
        employees with balances for {YEAR} · {covered} have at least one balance.
      </p>
    </div>
  );
}
