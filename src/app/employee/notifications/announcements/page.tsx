import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import NotifList, { type NotifRow } from "../NotifList";

export default async function AnnouncementNotificationsPage() {
  const { employee, organisationId, org } = await employeeContext();

  // Broadcasts only — organisation-wide rows are the ones with no target user.
  const notifications = await prisma.orgNotification.findMany({
    where: { organisationId, userId: null },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {org.name} · {employee.firstName} {employee.lastName}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Company Announcements
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Messages sent to everyone at {org.name}
          </p>
        </div>
        <Link href="/employee/notifications" className="text-xs text-violet-600 hover:underline">
          ← All notifications
        </Link>
      </div>

      {/* ── What this page is ── */}
      <div className="card mb-5 border-violet-200 bg-violet-50/60 p-4">
        <div className="flex items-start gap-3">
          <span aria-hidden className="text-lg">
            📢
          </span>
          <div>
            <p className="text-sm font-semibold text-violet-900">Company-wide announcements</p>
            <p className="mt-0.5 text-xs leading-relaxed text-violet-700">
              Everything on this page was broadcast to every member of {org.name} — it isn&apos;t
              specific to you. For anything personal, check your other notifications or speak to
              your manager.
            </p>
          </div>
        </div>
      </div>

      <NotifList
        rows={rows}
        emptyTitle="No announcements"
        emptyHint={`When ${org.name} posts a company-wide announcement, it will appear here.`}
      />
    </div>
  );
}
