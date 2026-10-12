import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { StatCard, TableWrap, EmptyState } from "@/components/ui";
import { BarList, ChartPanel, ProgressBar, type BarItem } from "@/components/charts";
import { initials } from "@/lib/format";

const PAGE = 25;

export default async function LeaveBalancesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; employee?: string; type?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await hrContext();

  const employeeId = strParam(sp.employee);
  const leaveTypeId = strParam(sp.type);
  const page = intParam(sp.page, 1, 500);

  const yearRows = await prisma.leaveBalance.findMany({
    where: { organisationId },
    distinct: ["year"],
    select: { year: true },
    orderBy: { year: "desc" },
  });
  const yearList = yearRows.map((y) => y.year);
  const currentYear = new Date().getFullYear();
  const year = intParam(sp.year, yearList[0] ?? currentYear);

  const where = {
    organisationId,
    year,
    ...(employeeId ? { employeeId } : {}),
    ...(leaveTypeId ? { leaveTypeId } : {}),
  };

  const [total, rows, totals, employees, leaveTypes, byType] = await Promise.all([
    prisma.leaveBalance.count({ where }),
    prisma.leaveBalance.findMany({
      where,
      orderBy: [{ employee: { lastName: "asc" } }, { leaveType: { name: "asc" } }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        leaveType: { select: { id: true, name: true, colour: true } },
      },
    }),
    prisma.leaveBalance.aggregate({
      where: { organisationId, year },
      _sum: { entitlement: true, taken: true, pending: true, carriedOver: true },
    }),
    prisma.employee.findMany({
      where: { organisationId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.leaveType.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, colour: true },
    }),
    prisma.leaveBalance.groupBy({
      by: ["leaveTypeId"],
      where: { organisationId, year },
      _sum: { taken: true },
    }),
  ]);

  const sumEntitlement = Number(totals._sum.entitlement ?? 0);
  const sumTaken = Number(totals._sum.taken ?? 0);
  const sumPending = Number(totals._sum.pending ?? 0);
  const sumCarried = Number(totals._sum.carriedOver ?? 0);
  const sumAvailable = sumEntitlement + sumCarried - sumTaken - sumPending;

  const typeBars: BarItem[] = leaveTypes
    .map((t) => ({
      label: t.name,
      value: Number(byType.find((b) => b.leaveTypeId === t.id)?._sum.taken ?? 0),
      color: t.colour,
    }))
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = { year, employee: employeeId || undefined, type: leaveTypeId || undefined };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Leave balances
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {org.name} · entitlement, usage and availability per employee and leave type
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Entitlement"
          value={sumEntitlement.toFixed(1)}
          hint={`${year} · includes accruals`}
          tone="sky"
        />
        <StatCard label="Taken" value={sumTaken.toFixed(1)} hint={`${year} leave used`} tone="emerald" />
        <StatCard
          label="Pending"
          value={sumPending.toFixed(1)}
          hint="Awaiting approval"
          tone={sumPending ? "amber" : "emerald"}
        />
        <StatCard
          label="Available"
          value={sumAvailable.toFixed(1)}
          hint={`${sumCarried.toFixed(1)} carried over`}
          tone={sumAvailable < 0 ? "rose" : "indigo"}
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Leave taken by type" subtitle={`Total days taken in ${year}`}>
          <BarList items={typeBars} valueFormat={(v) => v.toFixed(1)} />
        </ChartPanel>

        <ChartPanel title="Filter balances" subtitle="Narrow the ledger by employee or type">
          <form method="GET" action="/hr/leave/balances" className="space-y-3">
            <div>
              <label className="label" htmlFor="lb-year">
                Year
              </label>
              <select id="lb-year" name="year" defaultValue={String(year)} className="input">
                {(yearList.length ? yearList : [currentYear]).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="lb-emp">
                Employee
              </label>
              <select id="lb-emp" name="employee" defaultValue={employeeId} className="input">
                <option value="">All employees</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} ({e.employeeNumber})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="lb-type">
                Leave type
              </label>
              <select id="lb-type" name="type" defaultValue={leaveTypeId} className="input">
                <option value="">All types</option>
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-secondary w-full">
              Apply filters
            </button>
          </form>
        </ChartPanel>
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No leave balances for these filters"
            hint="Adjust the year, employee or leave type — or add balances when onboarding staff."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Leave type</th>
                  <th className="th">Year</th>
                  <th className="th text-right">Entitlement</th>
                  <th className="th text-right">Taken</th>
                  <th className="th text-right">Pending</th>
                  <th className="th text-right">Carried over</th>
                  <th className="th text-right">Available</th>
                  <th className="th">Usage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((b) => {
                  const entitlement = Number(b.entitlement);
                  const taken = Number(b.taken);
                  const pending = Number(b.pending);
                  const carried = Number(b.carriedOver);
                  const available = entitlement + carried - taken - pending;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/70">
                      <td className="td">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-50 text-[11px] font-semibold text-sky-600">
                            {initials(`${b.employee.firstName} ${b.employee.lastName}`)}
                          </span>
                          <div>
                            <div className="font-medium text-slate-800">
                              {b.employee.firstName} {b.employee.lastName}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {b.employee.employeeNumber}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="td">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: `${b.leaveType.colour}1a`,
                            color: b.leaveType.colour,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: b.leaveType.colour }}
                          />
                          {b.leaveType.name}
                        </span>
                      </td>
                      <td className="td text-slate-500">{b.year}</td>
                      <td className="td text-right tabular-nums text-slate-700">
                        {entitlement.toFixed(1)}
                      </td>
                      <td className="td text-right tabular-nums text-slate-700">
                        {taken.toFixed(1)}
                      </td>
                      <td className="td text-right tabular-nums text-amber-600">
                        {pending.toFixed(1)}
                      </td>
                      <td className="td text-right tabular-nums text-slate-500">
                        {carried.toFixed(1)}
                      </td>
                      <td
                        className={`td text-right font-semibold tabular-nums ${
                          available < 0 ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {available.toFixed(1)}
                      </td>
                      <td className="td">
                        {entitlement > 0 ? (
                          <ProgressBar
                            value={Math.max(0, taken)}
                            max={entitlement}
                            tone={taken / entitlement > 0.85 ? "rose" : "sky"}
                            size="sm"
                            showLabel={false}
                          />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>

            {pages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Page {page} of {pages} · {total} balance rows
                </span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={qs({ ...base, page: page - 1 })}
                      className="btn-secondary !py-1.5 text-xs"
                    >
                      ← Previous
                    </Link>
                  )}
                  {page < pages && (
                    <Link
                      href={qs({ ...base, page: page + 1 })}
                      className="btn-secondary !py-1.5 text-xs"
                    >
                      Next →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
