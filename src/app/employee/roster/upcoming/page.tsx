import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext, intParam, qs } from "@/lib/employee";
import { Badge, EmptyState, StatCard, TableWrap } from "@/components/ui";
import { ChartPanel, ColumnChart } from "@/components/charts";
import { formatDate } from "@/lib/format";

const PAGE_SIZE = 20;

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const addDays = (d: Date, days: number) => {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
};

/**
 * Calendar-day key for a @db.Date value — Prisma stores and returns these at
 * midnight, so the ISO prefix groups shifts into the same buckets the query
 * uses, independent of the server timezone.
 */
const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

/** Badge tone per ShiftStatus (Badge palette only). */
const SHIFT_TONE: Record<string, string> = {
  SCHEDULED: "blue",
  CONFIRMED: "green",
  SWAP_REQUESTED: "purple",
  SWAPPED: "purple",
  CANCELLED: "red",
  COMPLETED: "slate",
  MISSED: "amber",
};

export default async function UpcomingShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const { employee, organisationId, org } = await employeeContext();
  const page = intParam(sp.page, 1, 500);

  const today = D(0);
  const horizon = D(13);
  const where = {
    employeeId: employee.id,
    organisationId,
    date: { gte: today },
    status: { not: "CANCELLED" as const },
  };

  const [totalRows, shifts, windowShifts, swappable, nextShift] = await Promise.all([
    prisma.shift.count({ where }),
    prisma.shift.findMany({
      where,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { location: { select: { name: true } } },
    }),
    prisma.shift.findMany({
      where: { ...where, date: { gte: today, lte: horizon } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: { date: true, hours: true },
    }),
    prisma.shift.count({
      where: { ...where, status: { in: ["SCHEDULED", "CONFIRMED"] } },
    }),
    prisma.shift.findFirst({
      where,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: { location: { select: { name: true } } },
    }),
  ]);

  // Hours per day for the next 14 days.
  const byDay = new Map<string, number>();
  for (const s of windowShifts) {
    const key = dayKey(s.date);
    byDay.set(key, (byDay.get(key) ?? 0) + Number(s.hours));
  }
  const hourPoints = Array.from({ length: 14 }, (_, i) => {
    const key = dayKey(addDays(today, i));
    const date = new Date(`${key}T00:00:00Z`);
    return {
      label: `${date.toLocaleDateString("en-AU", { weekday: "short" })} ${date.getDate()}`,
      value: Math.round((byDay.get(key) ?? 0) * 10) / 10,
    };
  });
  const windowHours =
    Math.round(windowShifts.reduce((a, s) => a + Number(s.hours), 0) * 10) / 10;

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageHref = (p: number) =>
    `/employee/roster/upcoming${qs({ page: p > 1 ? p : undefined })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {org.name} · {employee.firstName} {employee.lastName}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Upcoming Shifts
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Everything rostered from today onwards
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/employee/roster" className="btn-secondary">
            My Schedule
          </Link>
          <Link href="/employee/roster/swaps" className="btn-primary">
            Request a swap
          </Link>
        </div>
      </div>

      {/* ── Next shift callout ── */}
      {nextShift && (
        <div className="card border-violet-200 bg-violet-50 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
                Next shift
              </p>
              <p className="mt-1 text-base font-semibold text-slate-900 sm:text-lg">
                {nextShift.date.toLocaleDateString("en-AU", { weekday: "long" })},{" "}
                {formatDate(nextShift.date)} · {nextShift.startTime}–{nextShift.endTime}
              </p>
              <p className="mt-0.5 text-sm text-violet-700">
                {nextShift.location?.name ?? "Location TBA"}
                {nextShift.roleLabel ? ` · ${nextShift.roleLabel}` : ""}
              </p>
            </div>
            <Link href={`/employee/shifts/${nextShift.id}`} className="btn-primary">
              View details
            </Link>
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Upcoming shifts"
          value={totalRows}
          hint="From today onwards"
          tone="indigo"
        />
        <StatCard
          label="Hours · next 14 days"
          value={windowHours.toFixed(1)}
          hint="Rostered hours (after breaks)"
          tone="emerald"
        />
        <StatCard
          label="Swappable shifts"
          value={swappable}
          hint="Scheduled or confirmed"
          tone="sky"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* ── Upcoming shifts table ── */}
        <div className="lg:col-span-2">
          {shifts.length === 0 ? (
            <EmptyState
              title="No upcoming shifts"
              hint="Nothing is rostered for you yet — check back after the next roster is published."
            />
          ) : (
            <>
              <TableWrap>
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Time</th>
                    <th className="th">Break</th>
                    <th className="th">Hours</th>
                    <th className="th">Location</th>
                    <th className="th">Role</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shifts.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="td whitespace-nowrap font-medium text-slate-800">
                        <Link
                          href={`/employee/shifts/${s.id}`}
                          className="hover:text-violet-600 hover:underline"
                        >
                          {formatDate(s.date)}
                        </Link>
                      </td>
                      <td className="td whitespace-nowrap tabular-nums text-slate-600">
                        {s.startTime}–{s.endTime}
                      </td>
                      <td className="td whitespace-nowrap text-slate-600">
                        {s.breakMinutes > 0 ? `${s.breakMinutes}m` : "—"}
                      </td>
                      <td className="td tabular-nums text-slate-600">
                        {Number(s.hours).toFixed(1)}
                      </td>
                      <td className="td text-slate-600">{s.location?.name ?? "—"}</td>
                      <td className="td text-slate-500">{s.roleLabel ?? "—"}</td>
                      <td className="td">
                        <Badge tone={SHIFT_TONE[s.status] ?? "slate"}>
                          {s.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>

              {/* ── Pagination ── */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, totalRows)} of {totalRows}
                </p>
                <div className="flex items-center gap-2">
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)} className="btn-secondary !py-1.5 text-xs">
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
                    <Link href={pageHref(page + 1)} className="btn-secondary !py-1.5 text-xs">
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

        {/* ── 14-day hours chart ── */}
        <ChartPanel title="Hours · next 14 days" subtitle="Rostered hours per day">
          <ColumnChart
            points={hourPoints}
            tone="violet"
            height={170}
            valueFormat={(v) => `${v}h`}
          />
        </ChartPanel>
      </div>
    </div>
  );
}
