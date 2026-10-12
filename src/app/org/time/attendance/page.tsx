import Link from "next/link";
import { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, ColumnChart, Donut } from "@/components/charts";
import { formatDate } from "@/lib/format";
import AttendanceActions from "./Actions";

export const dynamic = "force-dynamic";

const PAGE = 25;

/** Today ± n days as a calendar date (UTC midnight — how Prisma stores @db.Date). */
const D = (days: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + days));
};

/** "YYYY-MM-DD" → that calendar date (UTC midnight), or the fallback. */
const pd = (value: string | undefined, fallback: Date) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : fallback;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

const hhmm = (d?: Date | null) =>
  d
    ? new Date(d).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";

const TONE: Record<string, string> = {
  PRESENT: "green",
  LATE: "amber",
  HALF_DAY: "amber",
  ABSENT: "red",
  ON_LEAVE: "blue",
  REMOTE: "purple",
  MISSING: "slate",
};

const STATUSES = ["PRESENT", "LATE", "HALF_DAY", "ABSENT", "ON_LEAVE", "REMOTE", "MISSING"];

/** Chart palette — Badge tones and chart tones are deliberately different. */
const CHART_TONE: Record<string, "emerald" | "amber" | "rose" | "sky" | "violet" | "slate"> = {
  PRESENT: "emerald",
  LATE: "amber",
  HALF_DAY: "amber",
  ABSENT: "rose",
  ON_LEAVE: "sky",
  REMOTE: "violet",
  MISSING: "slate",
};

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Present",
  LATE: "Late",
  HALF_DAY: "Half day",
  ABSENT: "Absent",
  ON_LEAVE: "On leave",
  REMOTE: "Remote",
  MISSING: "Missing punch",
};

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    status?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const from = pd(sp.from, D(-7));
  const to = pd(sp.to, D(0));
  const q = strParam(sp.q);
  const page = intParam(sp.page, 1);
  const status = parseEnum(AttendanceStatus, sp.status);

  const where = {
    organisationId,
    ...(to >= from ? { date: { gte: from, lte: to } } : { date: { gte: from } }),
    ...(status ? { status } : {}),
    ...(q
      ? {
          employee: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { employeeNumber: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const today = D(0);
  const [total, rows, presentToday, absentToday, lateToday, leaveToday, missingToday, employees,
    statusBreakdown, dailyTrend] =
    await Promise.all([
      prisma.attendanceRecord.count({ where }),
      prisma.attendanceRecord.findMany({
        where,
        orderBy: [{ date: "desc" }, { employee: { lastName: "asc" } }],
        skip: (page - 1) * PAGE,
        take: PAGE,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          },
        },
      }),
      prisma.attendanceRecord.count({
        where: {
          organisationId,
          date: today,
          status: { in: ["PRESENT", "REMOTE", "HALF_DAY"] },
        },
      }),
      prisma.attendanceRecord.count({ where: { organisationId, date: today, status: "ABSENT" } }),
      prisma.attendanceRecord.count({ where: { organisationId, date: today, status: "LATE" } }),
      prisma.attendanceRecord.count({ where: { organisationId, date: today, status: "ON_LEAVE" } }),
      prisma.attendanceRecord.count({ where: { organisationId, date: today, status: "MISSING" } }),
      prisma.employee.findMany({
        where: { organisationId, employmentStatus: { in: ["ACTIVE", "PROBATION", "LEAVE"] } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      }),
      prisma.attendanceRecord.groupBy({
        by: ["status"],
        where: { organisationId, date: { gte: from, lte: to } },
        _count: true,
      }),
      prisma.attendanceRecord.groupBy({
        by: ["date"],
        where: { organisationId, date: { gte: from, lte: to } },
        _count: true,
        orderBy: { date: "asc" },
        take: 31,
      }),
    ]);

  const base = { from: iso(from), to: iso(to), q: q || undefined, page };
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const hrs = (m: number) => `${(m / 60).toFixed(1)}h`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Attendance
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · clock records for {formatDate(from)} → {formatDate(to)}
          </p>
        </div>
        <AttendanceActions
          employees={employees.map((e) => ({
            id: e.id,
            name: `${e.firstName} ${e.lastName}`,
          }))}
        />
      </div>

      {/* ── Today at a glance ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Present today" value={presentToday} hint="Clocked / remote / half day" tone="emerald" />
        <StatCard label="Absent" value={absentToday} hint="Marked absent" tone={absentToday ? "rose" : "emerald"} />
        <StatCard label="Late" value={lateToday} hint="Late arrivals" tone={lateToday ? "amber" : "emerald"} />
        <StatCard label="On leave" value={leaveToday} hint="Approved leave" tone="sky" />
        <StatCard label="Missing punches" value={missingToday} hint="No clock in/out" tone={missingToday ? "amber" : "emerald"} />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel
          title="Status mix"
          subtitle={`Across ${formatDate(from)} → ${formatDate(to)}`}
        >
          <Donut
            segments={statusBreakdown.map((s) => ({
              label: STATUS_LABEL[s.status] ?? s.status,
              value: s._count,
              tone: CHART_TONE[s.status] ?? "slate",
            }))}
            size={136}
            thickness={16}
            centerValue={statusBreakdown.reduce((a, s) => a + s._count, 0)}
            centerLabel="records"
          />
        </ChartPanel>

        <ChartPanel
          title="Daily volume"
          subtitle="Attendance records per day in range"
          action={
            <span className="text-[11px] text-slate-400">
              {dailyTrend.length} days
            </span>
          }
        >
          <ColumnChart
            points={dailyTrend.map((d) => ({
              label: new Date(d.date).toLocaleDateString("en-AU", { day: "2-digit" }),
              value: d._count,
            }))}
            tone="sky"
            height={128}
          />
        </ChartPanel>
      </div>

      {/* ── Status chips ── */}
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
            {s === "ALL" ? "All" : s.replace("_", " ")}
          </Link>
        ))}
      </div>

      {/* ── Range + search ── */}
      <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="from">From</label>
          <input id="from" type="date" name="from" defaultValue={iso(from)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" type="date" name="to" defaultValue={iso(to)} className="input" />
        </div>
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="q">Employee</label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by name or employee number…"
          />
        </div>
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No attendance records in this range"
            hint="Widen the date range, clear the filters, or add a record manually."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Date</th>
                <th className="th">Clock in</th>
                <th className="th">Clock out</th>
                <th className="th">Break</th>
                <th className="th">Worked</th>
                <th className="th">Overtime</th>
                <th className="th">Status</th>
                <th className="th">Source</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">
                    {r.employee.firstName} {r.employee.lastName}
                    <span className="ml-1.5 text-[11px] text-slate-400">{r.employee.employeeNumber}</span>
                  </td>
                  <td className="td text-slate-500">{formatDate(r.date)}</td>
                  <td className="td tabular-nums">{hhmm(r.clockIn)}</td>
                  <td className="td tabular-nums">{hhmm(r.clockOut)}</td>
                  <td className="td text-slate-500">{r.breakMinutes}m</td>
                  <td className="td font-medium tabular-nums">{hrs(r.workedMinutes)}</td>
                  <td className="td tabular-nums">
                    {r.overtimeMinutes > 0 ? (
                      <span className="font-medium text-amber-600">{hrs(r.overtimeMinutes)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="td">
                    <Badge tone={TONE[r.status] ?? "slate"}>{r.status.replace("_", " ")}</Badge>
                  </td>
                  <td className="td">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">{r.source}</span>
                  </td>
                  <td className="td">
                    <div className="flex justify-end">
                      <AttendanceActions
                        record={{
                          id: r.id,
                          clockIn: r.clockIn ? hhmm(r.clockIn) : "",
                          clockOut: r.clockOut ? hhmm(r.clockOut) : "",
                          breakMinutes: r.breakMinutes,
                          status: r.status,
                          notes: r.notes ?? "",
                          label: `${r.employee.firstName} ${r.employee.lastName} · ${formatDate(r.date)}`,
                        }}
                      />
                    </div>
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
            Page {page} of {pages} · {total} records
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
