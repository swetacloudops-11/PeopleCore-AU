import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge } from "@/components/ui";
import { ChartPanel, ColumnChart } from "@/components/charts";
import { formatDate } from "@/lib/format";
import ClockWidget from "./ClockWidget";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

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

export default async function AttendancePage() {
  const { employee, org } = await employeeContext();

  const [todayRecord, recent, window14] = await Promise.all([
    prisma.attendanceRecord.findFirst({
      where: { employeeId: employee.id, organisationId: org.id, date: D(0) },
    }),
    prisma.attendanceRecord.findMany({
      where: { employeeId: employee.id, organisationId: org.id },
      orderBy: { date: "desc" },
      take: 7,
    }),
    prisma.attendanceRecord.findMany({
      where: { employeeId: employee.id, organisationId: org.id, date: { gte: D(-13) } },
      orderBy: { date: "asc" },
    }),
  ]);

  const points = window14.map((a) => ({
    label: a.date.toLocaleDateString("en-AU", { day: "2-digit" }),
    value: Math.round((a.workedMinutes / 60) * 10) / 10,
  }));
  const windowHours = window14.reduce((a, r) => a + r.workedMinutes, 0) / 60;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {formatDate(new Date())} · {org.name}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Time &amp; attendance
          </h1>
        </div>
        <Link href="/employee/attendance/history" className="btn-secondary">
          Full history →
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ClockWidget
            clockIn={todayRecord?.clockIn ? todayRecord.clockIn.toISOString() : null}
            clockOut={todayRecord?.clockOut ? todayRecord.clockOut.toISOString() : null}
            breakMinutes={todayRecord?.breakMinutes ?? 0}
            workedMinutes={todayRecord?.workedMinutes ?? 0}
          />

          {/* ── Recent activity ── */}
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Recent activity</h2>
              <span className="text-xs text-slate-400">Last {recent.length} records</span>
            </div>
            {recent.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">
                No attendance yet — clock in above to start your first record.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5"
                  >
                    <span className="w-24 text-[13px] font-medium text-slate-700">
                      {formatDate(r.date)}
                    </span>
                    <span className="min-w-28 text-xs tabular-nums text-slate-500">
                      {fmtTime(r.clockIn)} – {fmtTime(r.clockOut)}
                    </span>
                    <span className="text-xs tabular-nums text-slate-600">
                      {(r.workedMinutes / 60).toFixed(1)}h
                    </span>
                    <span className="ml-auto">
                      <Badge tone={STATUS_BADGE[r.status] ?? "slate"}>
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Fortnight hours ── */}
        <ChartPanel title="Hours worked" subtitle="Last 14 days from attendance">
          {points.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No attendance recorded yet</p>
          ) : (
            <>
              <ColumnChart
                points={points}
                tone="violet"
                height={150}
                valueFormat={(v) => `${v}h`}
              />
              <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                {windowHours > 0
                  ? `${windowHours.toFixed(1)}h across the fortnight`
                  : "No hours recorded in the window"}
              </div>
            </>
          )}
        </ChartPanel>
      </div>
    </div>
  );
}
