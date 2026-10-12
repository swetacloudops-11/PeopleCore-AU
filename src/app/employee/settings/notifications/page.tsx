import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import NotificationPrefsForm from "./NotificationPrefsForm";

export default async function NotificationPrefsPage() {
  const { session, organisationId } = await employeeContext();

  // Per-employee notification preferences are stored as OrgSetting rows keyed
  // `empnotif:<userId>:<topic>` (written by /api/employee/notifications).
  const rows = await prisma.orgSetting.findMany({
    where: {
      organisationId,
      group: "employee-notification",
      key: { startsWith: `empnotif:${session.id}:` },
    },
    select: { key: true, value: true },
  });

  // Plain { topic: boolean } — the suffix after the last ":" is the topic key.
  const prefs: Record<string, boolean> = {};
  for (const row of rows) {
    const topic = row.key.slice(row.key.lastIndexOf(":") + 1);
    if (topic) prefs[topic] = row.value === "true";
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Notification Preferences
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose which updates you want to hear about.
        </p>
      </div>

      <NotificationPrefsForm initial={prefs} />
    </div>
  );
}
