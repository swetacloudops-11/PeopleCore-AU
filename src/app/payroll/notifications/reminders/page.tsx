import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { ChartPanel, ColumnChart } from "@/components/charts";
import { formatDateTime, timeAgo } from "@/lib/format";
import MarkReadButton from "../MarkReadButton";

const CHART_DAYS = 14;

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Case-insensitive `contains` filter shorthand. */
const ci = (value: string) => ({ contains: value, mode: "insensitive" as const });

/**
 * Payroll-relevant notifications: the event/title/body mentions pay runs, pay
 * cycles or schedules. Covers PAY / PAYROLL / RUN / SCHEDULE events and any
 * title/body mentioning pay or schedule.
 */
const PAY_OR = [
  { event: ci("PAY") },
  { event: ci("PAYROLL") },
  { event: ci("RUN") },
  { event: ci("SCHEDULE") },
  { title: ci("pay") },
  { title: ci("payroll") },
  { title: ci("schedule") },
  { body: ci("pay") },
  { body: ci("payroll") },
  { body: ci("schedule") },
];

const CHANNEL_TONE: Record<string, string> = {
  EMAIL: "blue",
  IN_APP: "purple",
  SMS: "amber",
  PUSH: "green",
};

export default async function PayrollRemindersPage() {
  const { organisationId, org } = await payrollContext();

  const where = { organisationId, OR: PAY_OR };
  const windowStart = D(-(CHART_DAYS - 1));
  const days = Array.from({ length: CHART_DAYS }, (_, i) => D(-(CHART_DAYS - 1) + i));

  const [notifications, total, unread, thisWeek, windowRows] = await Promise.all([
    prisma.orgNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.orgNotification.count({ where }),
    prisma.orgNotification.count({ where: { ...where, isRead: false } }),
    prisma.orgNotification.count({ where: { ...where, createdAt: { gte: D(-6) } } }),
    prisma.orgNotification.findMany({
      where: { ...where, createdAt: { gte: windowStart } },
      select: { createdAt: true },
      take: 500,
    }),
  ]);

  const perDay = new Map<string, number>();
  for (const n of windowRows) {
    const key = dayKey(new Date(n.createdAt));
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const chartPoints = days.map((d) => ({
    label: d.toLocaleDateString("en-AU", { day: "2-digit" }),
    value: perDay.get(dayKey(d)) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Payroll Reminders"
        subtitle={`Pay runs, pay cycles and schedule reminders for ${org.name}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Unread"
          value={unread}
          hint={unread ? "Needs attention" : "All caught up"}
          tone={unread ? "amber" : "emerald"}
        />
        <StatCard label="Total" value={total} hint="Payroll notifications" tone="indigo" />
        <StatCard label="This week" value={thisWeek} hint="Last 7 days" tone="sky" />
      </div>

      <div className="mb-6">
        <ChartPanel title="Notifications per day" subtitle="Last 14 days">
          {windowRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No payroll notifications in the last 14 days
            </p>
          ) : (
            <ColumnChart points={chartPoints} tone="amber" height={116} />
          )}
        </ChartPanel>
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Reminder timeline</h2>
          <MarkReadButton unread={unread} />
        </div>

        {notifications.length === 0 ? (
          <EmptyState
            title="No payroll reminders"
            hint="Pay run, pay cycle and schedule notifications will appear here."
          />
        ) : (
          <div className="card divide-y divide-slate-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3.5 ${n.isRead ? "" : "bg-amber-50/40"}`}
              >
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.isRead ? "bg-slate-200" : "bg-amber-500"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[13px] ${
                        n.isRead ? "font-medium text-slate-700" : "font-semibold text-slate-900"
                      }`}
                    >
                      {n.title}
                    </span>
                    <Badge tone={CHANNEL_TONE[n.channel] ?? "slate"}>
                      {n.channel.replace(/_/g, " ")}
                    </Badge>
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl text-xs leading-snug text-slate-600">{n.body}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    <span title={formatDateTime(n.createdAt)}>{formatDateTime(n.createdAt)}</span>
                    <code className="text-slate-400">{n.event}</code>
                    {n.linkUrl && (
                      <Link href={n.linkUrl} className="text-amber-600 hover:underline">
                        Open →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {notifications.length < total && (
          <p className="mt-3 text-xs text-slate-400">
            Showing the {notifications.length} most recent of {total} payroll reminders.
          </p>
        )}
      </section>
    </div>
  );
}
