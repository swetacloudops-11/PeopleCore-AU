import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext, qs, intParam, strParam } from "@/lib/employee";
import { Badge, EmptyState, StatCard, TableWrap } from "@/components/ui";
import { ChartPanel, ColumnChart } from "@/components/charts";
import { formatDate } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const PAGE_SIZE = 25;

const STATUS_CHIPS = [
  "ALL",
  "PRESENT",
  "ABSENT",
  "LATE",
  "ON_LEAVE",
  "HALF_DAY",
  "REMOTE",
  "MISSING",
] as const;

const STATUS_BADGE: Record<string, string> = {
  PRESENT: "green",
  ABSENT: "red",
  LATE: "amber",
  ON_LEAVE: "blue",
  HALF_DAY: "purple",
  REMOTE: "blue",
  MISSING: "slate",
};

const fmtTime = (d: Date | null) =>
  d ? d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) : "—";

export default async function AttendanceHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { employee, org } = await employeeContext();

  const status = (strParam(sp.status) || "ALL").toUpperCase();
  const page = intParam(sp.page, 1);

  const where = {
    employeeId: employee.id,
    organisationId: org.id,
    ...(status !== "ALL" ? { status: status as never } : {}),
  };

  const [totalRows, records, daysPresent, sums, window8w] = await Promise.all([
    prisma.attendanceRecord.count({ where }),
    prisma.attendanceRecord.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.attendanceRecord.count({
      where: { employeeId: employee.id, organisationId: org.id, status: "PRESENT" },
    }),
    prisma.attendanceRecord.aggregate({
      where: { employeeId: employee.id, organisationId: org.id },
      _sum: { workedMinutes: true, overtimeMinutes: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { employeeId: employee.id, organisationId: org.id, date: { gte: D(-55) } },
      select: { date: true, workedMinutes: true },
    }),
  ]);

  const totalMinutes = sums._sum.workedMinutes ?? 0;
  const overtimeMinutes = sums._sum.overtimeMinutes ?? 0;

  // Weekly totals for the last 8 weeks — buckets keyed by the stored date.
  const minutesByKey = new Map<string, number>();
  for (const r of window8w) {
    const key = r.date.toISOString().slice(0, 10);
    minutesByKey.set(key, (minutesByKey.get(key) ?? 0) + r.workedMinutes);
  }
  const weekPoints = Array.from({ length: 8 }, (_, i) => {
    const start = D(-55 + 7 * i);
    const end = D(-48 + 7 * i);
    const k1 = start.toISOString().slice(0, 10);
    const k2 = end.toISOString().slice(0, 10);
    let minutes = 0;
    for (const [key, value] of minutesByKey) {
      if (key >= k1 && key <= k2) minutes += value;
    }
    return {
      label: end.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      value: Math.round((minutes / 60) * 10) / 10,
    };
  });

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/employee/attendance/history${qs({ status, page, ...overrides })}`;

  return (
    <div>
      <div className="mb-2">
        <Link href="/employee/attendance" className="text-xs text-violet-600 hover:underline">
          ← Back to clock in / out
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          My attendance history
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {org.name} · every clock in and out recorded for you
        </p>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Days present"
          value={daysPresent}
          hint="All-time records with PRESENT status"
          tone="emerald"
        />
        <StatCard
          label="Total hours"
          value={(totalMinutes / 60).toFixed(1)}
          hint="Worked hours across all records"
          tone="indigo"
        />
        <StatCard
          label="Avg hours / day"
          value={daysPresent > 0 ? (totalMinutes / 60 / daysPresent).toFixed(1) : "0.0"}
          hint="Based on days present"
          tone="sky"
        />
        <StatCard
          label="Overtime"
          value={(overtimeMinutes / 60).toFixed(1)}
          hint="All-time overtime hours"
          tone="amber"
        />
      </div>

      {/* ── Weekly hours ── */}
      <div className="mt-5">
        <ChartPanel title="Weekly hours" subtitle="Last 8 weeks, ending today">
          <ColumnChart
            points={weekPoints}
            tone="violet"
            height={140}
            valueFormat={(v) => `${v}h`}
          />
        </ChartPanel>
      </div>

      {/* ── Status filter chips ── */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        {STATUS_CHIPS.map((s) => {
          const activeChip = status === s;
          return (
            <Link
              key={s}
              href={pageHref({ status: s, page: 1 })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeChip
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s === "ALL" ? "ALL" : s.replace(/_/g, " ")}
            </Link>
          );
        })}
      </div>

      {/* ── Records table ── */}
      <div className="mt-4">
        {records.length === 0 ? (
          <EmptyState
            title="No attendance records found"
            hint={
              status === "ALL"
                ? "Clock in from the Time & attendance page to create your first record."
                : "No records match this status — try another filter."
            }
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Clock in</th>
                  <th className="th">Clock out</th>
                  <th className="th">Break</th>
                  <th className="th">Worked</th>
                  <th className="th">Overtime</th>
                  <th className="th">Status</th>
                  <th className="th">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="td whitespace-nowrap font-medium text-slate-800">
                      {formatDate(r.date)}
                    </td>
                    <td className="td whitespace-nowrap tabular-nums text-slate-600">
                      {fmtTime(r.clockIn)}
                    </td>
                    <td className="td whitespace-nowrap tabular-nums text-slate-600">
                      {fmtTime(r.clockOut)}
                    </td>
                    <td className="td text-slate-600">
                      {r.breakMinutes > 0 ? `${r.breakMinutes}m` : "—"}
                    </td>
                    <td className="td tabular-nums text-slate-700">
                      {(r.workedMinutes / 60).toFixed(1)}h
                    </td>
                    <td className="td tabular-nums text-slate-600">
                      {r.overtimeMinutes > 0 ? `${(r.overtimeMinutes / 60).toFixed(1)}h` : "—"}
                    </td>
                    <td className="td">
                      <Badge tone={STATUS_BADGE[r.status] ?? "slate"}>
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="td text-xs uppercase tracking-wide text-slate-400">
                      {r.source}
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
