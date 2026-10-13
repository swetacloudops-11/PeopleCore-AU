import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

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

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  PAID: "green",
  FAILED: "red",
};

const PERIOD_SPAN: Record<string, number> = { WEEKLY: 7, FORTNIGHTLY: 14 };

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

/** The period a pay date belongs to: it ends the day before the pay date. */
function periodFor(frequency: string, payDate: Date): { start: Date; end: Date } {
  const end = addDays(payDate, -1);
  if (frequency === "MONTHLY") {
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    return { start, end };
  }
  const span = PERIOD_SPAN[frequency] ?? 14;
  const start = addDays(end, -(span - 1));
  return { start, end };
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default async function PayPeriodsPage() {
  const { organisationId, org } = await payrollContext();
  const today = D(0);

  const schedules = await prisma.paySchedule.findMany({
    where: { organisationId, isActive: true },
    orderBy: { name: "asc" },
    include: {
      payRuns: {
        orderBy: { payDate: "desc" },
        take: 5,
        select: {
          id: true,
          label: true,
          status: true,
          payDate: true,
          periodStart: true,
          periodEnd: true,
          employeeCount: true,
          netPay: true,
        },
      },
    },
  });

  return (
    <div>
      <PageHeader
        title="Manage Pay Periods"
        subtitle={`${org.name} · upcoming periods derived from each active schedule`}
      />

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Periods are projections: the next six are computed from each schedule&apos;s frequency and
        pay day. A period is locked once a pay run exists for its pay date.
      </div>

      {schedules.length === 0 ? (
        <EmptyState
          title="No active schedules"
          hint="Activate or create a pay schedule to project upcoming pay periods."
        />
      ) : (
        <div className="space-y-5">
          {schedules.map((s) => {
            const runs = upcomingRuns(s.frequency, s.payDay, s.nextRunDate, today, 6);
            return (
              <section key={s.id} className="card p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800">{s.name}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {s.frequency.charAt(0) + s.frequency.slice(1).toLowerCase()} · pay day{" "}
                      {DAYS[s.payDay] ?? s.payDay}
                    </p>
                  </div>
                  <Badge tone="amber">{runs.length} upcoming periods</Badge>
                </div>

                <TableWrap>
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Period start</th>
                      <th className="th">Period end</th>
                      <th className="th">Pay date</th>
                      <th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {runs.map((payDate) => {
                      const period = periodFor(s.frequency, payDate);
                      const locked = s.payRuns.find((r) => sameDay(r.payDate, payDate));
                      return (
                        <tr key={payDate.toISOString()} className="hover:bg-slate-50/70">
                          <td className="td whitespace-nowrap text-slate-600">
                            {formatDate(period.start)}
                          </td>
                          <td className="td whitespace-nowrap text-slate-600">
                            {formatDate(period.end)}
                          </td>
                          <td className="td whitespace-nowrap font-medium text-slate-800">
                            {formatDate(payDate)}
                          </td>
                          <td className="td">
                            {locked ? (
                              <Badge tone={STATUS_BADGE[locked.status] ?? "slate"}>
                                🔒 {locked.label}
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-400">Open</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableWrap>

                <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Recent pay runs
                </h3>
                {s.payRuns.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                    No pay runs attached to this schedule yet.
                  </p>
                ) : (
                  <TableWrap>
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="th">Pay run</th>
                        <th className="th">Period</th>
                        <th className="th">Pay date</th>
                        <th className="th">Status</th>
                        <th className="th text-right">Net pay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {s.payRuns.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/70">
                          <td className="td font-medium text-slate-700">{r.label}</td>
                          <td className="td whitespace-nowrap text-slate-500">
                            {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                          </td>
                          <td className="td whitespace-nowrap text-slate-500">
                            {formatDate(r.payDate)}
                          </td>
                          <td className="td">
                            <Badge tone={STATUS_BADGE[r.status] ?? "slate"}>
                              {r.status.replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="td text-right tabular-nums text-slate-600">
                            {formatMoney(Number(r.netPay))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
