import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import NotifList, { type NotifRow } from "../NotifList";

export default async function LeaveNotificationsPage() {
  const { employee, organisationId, session, org } = await employeeContext();

  // Leave-related rows only: event code, "leave" in the title or body,
  // or a link pointing into the person's leave pages.
  const notifications = await prisma.orgNotification.findMany({
    where: {
      organisationId,
      AND: [
        { OR: [{ userId: session.id }, { userId: null }] },
        {
          OR: [
            { event: { contains: "LEAVE" } },
            { title: { contains: "leave", mode: "insensitive" } },
            { body: { contains: "leave", mode: "insensitive" } },
            { linkUrl: { contains: "/employee/leave" } },
          ],
        },
      ],
    },
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
            Leave Updates
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Decisions and changes on your leave requests
          </p>
        </div>
        <Link href="/employee/notifications" className="text-xs text-violet-600 hover:underline">
          ← All notifications
        </Link>
      </div>

      <NotifList
        rows={rows}
        emptyTitle="No leave updates"
        emptyHint="When your leave requests are approved, declined or commented on, you'll see it here."
      />
    </div>
  );
}
