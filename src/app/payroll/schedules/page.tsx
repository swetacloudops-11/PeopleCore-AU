import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { formatDate } from "@/lib/format";
import ScheduleActions from "./ScheduleActions";

export const dynamic = "force-dynamic";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const FREQ_TONE: Record<string, string> = {
  WEEKLY: "blue",
  FORTNIGHTLY: "purple",
  MONTHLY: "slate",
};

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function advance(d: Date, frequency: string): Date {
  if (frequency === "WEEKLY") return addDays(d, 7);
  if (frequency === "MONTHLY") return addMonths(d, 1);
  return addDays(d, 14);
}

function nextOnOrAfter(from: Date, payDay: number): Date {
  const x = new Date(from);
  x.setHours(0, 0, 0, 0);
  const diff = (payDay - x.getDay() + 7) % 7;
  return addDays(x, diff);
}

/** Next `count` run dates from frequency + payDay + optional nextRunDate. */
function upcomingRuns(
  frequency: string,
  payDay: number,
  nextRunDate: Date | null,
  from: Date,
  count: number
): Date[] {
  let cursor = nextRunDate ? new Date(nextRunDate) : nextOnOrAfter(from, payDay);
  cursor.setHours(0, 0, 0, 0);
  let guard = 0;
  while (cursor.getTime() < from.getTime() && guard < 600) {
    cursor = advance(cursor, frequency);
    guard += 1;
  }
  const out: Date[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(cursor);
    cursor = advance(cursor, frequency);
  }
  return out;
}

export default async function PaySchedulesPage() {
  const { organisationId, org } = await payrollContext();
  const today = D(0);

  const [schedules, activeCount, totalRuns] = await Promise.all([
    prisma.paySchedule.findMany({
      where: { organisationId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { _count: { select: { payRuns: true } } },
    }),
    prisma.paySchedule.count({ where: { organisationId, isActive: true } }),
    prisma.payRun.count({ where: { organisationId } }),
  ]);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  let scheduledThisMonth = 0;
  for (const s of schedules) {
    if (!s.isActive) continue;
    scheduledThisMonth += upcomingRuns(s.frequency, s.payDay, s.nextRunDate, today, 12).filter(
      (d) => d >= monthStart && d <= monthEnd
    ).length;
  }

  return (
    <div>
      <PageHeader
        title="All Pay Schedules"
        subtitle={`${org.name} · cadence and pay days that drive future pay runs`}
        action={{ label: "Add schedule", href: "/payroll/schedules/new" }}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Schedules" value={schedules.length} hint="All frequencies" tone="amber" />
        <StatCard
          label="Active"
          value={activeCount}
          hint={`${schedules.length - activeCount} paused`}
          tone="emerald"
        />
        <StatCard
          label="Runs scheduled this month"
          value={scheduledThisMonth}
          hint="Derived from active schedules"
          tone="indigo"
        />
      </div>

      <div className="mt-6">
        {schedules.length === 0 ? (
          <EmptyState
            title="No pay schedules yet"
            hint="Create a schedule to set the cadence for future pay runs."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Schedule</th>
                <th className="th">Frequency</th>
                <th className="th">Pay day</th>
                <th className="th">Next run dates</th>
                <th className="th text-right">Pay runs</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedules.map((s) => {
                const next = upcomingRuns(s.frequency, s.payDay, s.nextRunDate, today, 3);
                return (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">{s.name}</td>
                    <td className="td">
                      <Badge tone={FREQ_TONE[s.frequency] ?? "slate"}>{s.frequency}</Badge>
                    </td>
                    <td className="td text-slate-500">{DAYS[s.payDay] ?? s.payDay}</td>
                    <td className="td">
                      <div className="text-slate-700">{formatDate(next[0])}</div>
                      <div className="text-[11px] text-slate-400">
                        {next
                          .slice(1)
                          .map((d) => formatDate(d))
                          .join(" · ")}
                      </div>
                    </td>
                    <td className="td text-right tabular-nums text-slate-600">
                      {s._count.payRuns}
                    </td>
                    <td className="td">
                      <Badge tone={s.isActive ? "green" : "slate"}>
                        {s.isActive ? "ACTIVE" : "PAUSED"}
                      </Badge>
                    </td>
                    <td className="td">
                      <ScheduleActions
                        schedule={{
                          id: s.id,
                          name: s.name,
                          frequency: s.frequency,
                          payDay: s.payDay,
                          nextRunDate: s.nextRunDate
                            ? s.nextRunDate.toISOString().slice(0, 10)
                            : null,
                          isActive: s.isActive,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        {totalRuns} pay run{totalRuns === 1 ? "" : "s"} on record across all schedules.
      </p>
    </div>
  );
}
