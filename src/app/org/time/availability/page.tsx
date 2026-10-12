import { prisma } from "@/lib/prisma";
import { orgContext, strParam } from "@/lib/org";
import { StatCard, TableWrap, EmptyState } from "@/components/ui";
import AvailabilityCell from "./Actions";

export const dynamic = "force-dynamic";

/** Display order Mon → Sun (dayOfWeek is 0 = Sunday … 6 = Saturday). */
const DAYS: Array<{ dow: number; label: string }> = [
  { dow: 1, label: "Mon" },
  { dow: 2, label: "Tue" },
  { dow: 3, label: "Wed" },
  { dow: 4, label: "Thu" },
  { dow: 5, label: "Fri" },
  { dow: 6, label: "Sat" },
  { dow: 0, label: "Sun" },
];

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();
  const q = strParam(sp.q);

  const employees = await prisma.employee.findMany({
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
  });

  const rows = await prisma.availability.findMany({
    where: { organisationId, employeeId: { in: employees.map((e) => e.id) } },
    select: {
      id: true,
      employeeId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      isAvailable: true,
      note: true,
    },
  });

  const byKey = new Map(rows.map((r) => [`${r.employeeId}:${r.dayOfWeek}`, r]));
  const unavailable = rows.filter((r) => !r.isAvailable).length;
  const weekdayAvailable = rows.filter((r) => r.dayOfWeek >= 1 && r.dayOfWeek <= 5 && r.isAvailable).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Employee availability
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · weekly availability matrix, Mon → Sun
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Employees" value={employees.length} hint="Active profiles" tone="indigo" />
        <StatCard label="Availability rows" value={rows.length} hint="Days configured" tone="sky" />
        <StatCard label="Weekday slots open" value={weekdayAvailable} hint="Mon–Fri available" tone="emerald" />
        <StatCard label="Unavailable days" value={unavailable} hint="Marked unavailable" tone={unavailable ? "amber" : "emerald"} />
      </div>

      <form method="GET" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="av-q">Employee</label>
          <input
            id="av-q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by name or employee number…"
          />
        </div>
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      <div className="mt-4">
        {employees.length === 0 ? (
          <EmptyState title="No employees match that search" />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                {DAYS.map((d) => (
                  <th key={d.dow} className="th text-center">{d.label}</th>
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
                  {DAYS.map((d) => {
                    const r = byKey.get(`${e.id}:${d.dow}`);
                    return (
                      <td key={d.dow} className="td text-center">
                        <AvailabilityCell
                          cell={{
                            id: r?.id,
                            employeeId: e.id,
                            employeeName: `${e.firstName} ${e.lastName}`,
                            dayOfWeek: d.dow,
                            dayLabel: d.label,
                            isAvailable: r?.isAvailable ?? true,
                            startTime: r?.startTime ?? "09:00",
                            endTime: r?.endTime ?? "17:00",
                            hasRecord: Boolean(r),
                            note: r?.note ?? "",
                          }}
                        />
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
        Click any cell to edit that day. Missing days are created on save; existing rows are
        updated in place.
      </p>
    </div>
  );
}
