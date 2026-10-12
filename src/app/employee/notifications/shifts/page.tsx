import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import NotifList, { type NotifRow } from "../NotifList";

export default async function ShiftNotificationsPage() {
  const { employee, organisationId, session, org } = await employeeContext();

  // Shift/roster-related rows only: event code, "shift" in the title or body,
  // or a link pointing into the person's roster.
  const notifications = await prisma.orgNotification.findMany({
    where: {
      organisationId,
      AND: [
        { OR: [{ userId: session.id }, { userId: null }] },
        {
          OR: [
            { event: { contains: "SHIFT" } },
            { title: { contains: "shift", mode: "insensitive" } },
            { body: { contains: "shift", mode: "insensitive" } },
            { linkUrl: { contains: "/employee/roster" } },
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
            Shift Updates
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Published rosters, shift changes and swap decisions for you
          </p>
        </div>
        <Link href="/employee/notifications" className="text-xs text-violet-600 hover:underline">
          ← All notifications
        </Link>
      </div>

      <NotifList
        rows={rows}
        emptyTitle="No shift updates"
        emptyHint="You'll see roster changes, published rosters and swap decisions here as they happen."
      />
    </div>
  );
}
