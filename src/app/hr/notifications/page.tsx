import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, strParam } from "@/lib/hr";
import { Badge, StatCard, EmptyState } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/format";

const CHANNEL_TONE: Record<string, string> = {
  EMAIL: "blue",
  IN_APP: "purple",
  SMS: "amber",
  PUSH: "green",
};

function bail(message: string): never {
  redirect(`/hr/notifications?error=${encodeURIComponent(message)}`);
}

/** Mark a single notification as read — mirrors PATCH /api/hr/notifications. */
async function markRead(formData: FormData) {
  "use server";
  const { organisationId } = await hrContext();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) bail("Missing notification");

  await prisma.orgNotification.updateMany({
    where: { id, organisationId },
    data: { isRead: true },
  });

  revalidatePath("/hr/notifications");
  redirect("/hr/notifications");
}

/** Mark every unread notification as read — mirrors PATCH read_all. */
async function markAllRead() {
  "use server";
  const { organisationId } = await hrContext();

  await prisma.orgNotification.updateMany({
    where: { organisationId, isRead: false },
    data: { isRead: true },
  });

  revalidatePath("/hr/notifications");
  redirect("/hr/notifications");
}

export default async function HrNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ read?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await hrContext();

  const filter = strParam(sp.read) === "unread" ? "unread" : "all";
  const where = {
    organisationId,
    ...(filter === "unread" ? { isRead: false } : {}),
  };

  const [notifications, unread, total] = await Promise.all([
    prisma.orgNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.orgNotification.count({ where: { organisationId, isRead: false } }),
    prisma.orgNotification.count({ where: { organisationId } }),
  ]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = notifications.filter((n) => n.createdAt >= todayStart).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Employee notifications
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · in-app alerts issued to the organisation
          </p>
        </div>
        <form action={markAllRead}>
          <button type="submit" className="btn-primary" disabled={unread === 0}>
            Mark all as read
          </button>
        </form>
      </div>

      {sp.error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {sp.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Notifications" value={total} hint="All time" tone="sky" />
        <StatCard
          label="Unread"
          value={unread}
          hint="Require attention"
          tone={unread ? "amber" : "emerald"}
        />
        <StatCard label="Shown" value={notifications.length} hint="Current view" tone="indigo" />
        <StatCard label="Today" value={today} hint="Issued in this view" tone="sky" />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          { key: "all", label: "All", href: "/hr/notifications" },
          { key: "unread", label: "Unread", href: "/hr/notifications?read=unread" },
        ].map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === chip.key
                ? "bg-sky-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {chip.label}
            {chip.key === "unread" && ` · ${unread}`}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {notifications.length === 0 ? (
          <EmptyState
            title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
            hint="Policy reminders and expiry alerts will appear here."
          />
        ) : (
          <div className="card divide-y divide-slate-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 ${
                  n.isRead ? "" : "bg-sky-50/40"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!n.isRead && <span className="h-2 w-2 rounded-full bg-sky-500" />}
                    <span className="text-[13px] font-medium text-slate-800">{n.title}</span>
                    <Badge tone={CHANNEL_TONE[n.channel] ?? "slate"}>{n.channel}</Badge>
                  </div>
                  <p className="mt-1 max-w-3xl text-xs leading-snug text-slate-600">{n.body}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    <span title={formatDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</span>
                    <code className="text-slate-400">{n.event}</code>
                    {n.linkUrl && (
                      <Link href={n.linkUrl} className="text-sky-600 hover:underline">
                        Open →
                      </Link>
                    )}
                  </div>
                </div>
                {!n.isRead && (
                  <form action={markRead} className="shrink-0">
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      Mark read
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {filter === "all" && notifications.length < total && (
        <p className="mt-3 text-xs text-slate-400">
          Showing the {notifications.length} most recent of {total} notifications.{" "}
          <Link href={qs({ read: "unread" })} className="text-sky-600 hover:underline">
            View unread
          </Link>
        </p>
      )}
    </div>
  );
}
