import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext, intParam, qs } from "@/lib/employee";
import { StatCard, EmptyState } from "@/components/ui";
import { ChartPanel, ColumnChart } from "@/components/charts";
import NotifList, { type NotifRow } from "./NotifList";

const PAGE_SIZE = 25;
const CHART_DAYS = 14;

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

/** Local-day key — slicing the ISO string would shift the day in AU timezones. */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const TABS = [
  { label: "All", href: "/employee/notifications" },
  { label: "Shift updates", href: "/employee/notifications/shifts" },
  { label: "Leave updates", href: "/employee/notifications/leave" },
  { label: "Announcements", href: "/employee/notifications/announcements" },
];

export default async function EmployeeNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const { employee, organisationId, session, org } = await employeeContext();
  const page = intParam(sp.page, 1, 500);

  // Rows targeted at this person plus organisation-wide broadcasts.
  const scope = {
    organisationId,
    OR: [{ userId: session.id }, { userId: null }],
  };

  const windowStart = D(-(CHART_DAYS - 1));
  const days = Array.from({ length: CHART_DAYS }, (_, i) => D(-(CHART_DAYS - 1) + i));

  const [totalRows, unread, thisWeek, notifications, windowRows] = await Promise.all([
    prisma.orgNotification.count({ where: scope }),
    prisma.orgNotification.count({ where: { ...scope, isRead: false } }),
    prisma.orgNotification.count({ where: { ...scope, createdAt: { gte: D(-6) } } }),
    prisma.orgNotification.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.orgNotification.findMany({
      where: { ...scope, createdAt: { gte: windowStart } },
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

  const rows: NotifRow[] = notifications.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    event: n.event,
    channel: n.channel,
    isRead: n.isRead,
    linkUrl: n.linkUrl,
    createdAt: n.createdAt.toISOString(),
  }));

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageHref = (p: number) => `/employee/notifications${qs({ page: p > 1 ? p : undefined })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {org.name} · {employee.firstName} {employee.lastName}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Everything aimed at you, plus company-wide broadcasts
          </p>
        </div>
        <Link href="/employee/settings/notifications" className="text-xs text-violet-600 hover:underline">
          Notification preferences →
        </Link>
      </div>

      {/* ── Views ── */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = t.href === "/employee/notifications";
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                active ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Unread"
          value={unread}
          hint={unread ? "Needs your attention" : "All caught up"}
          tone={unread ? "amber" : "emerald"}
        />
        <StatCard label="Total" value={totalRows} hint="Yours + company-wide" tone="indigo" />
        <StatCard label="This week" value={thisWeek} hint="Received in the last 7 days" tone="sky" />
      </div>

      {/* ── Volume over time ── */}
      <div className="mt-5">
        <ChartPanel title="Notifications per day" subtitle="Last 14 days">
          {windowRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No notifications in the last 14 days
            </p>
          ) : (
            <ColumnChart points={chartPoints} tone="violet" height={116} />
          )}
        </ChartPanel>
      </div>

      {/* ── The list ── */}
      <div className="mt-5">
        {rows.length === 0 ? (
          <EmptyState
            title="No notifications yet"
            hint="Shift updates, leave decisions and company announcements will land here."
          />
        ) : (
          <>
            <NotifList rows={rows} />

            {/* ── Pagination ── */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} of{" "}
                {totalRows}
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
    </div>
  );
}
