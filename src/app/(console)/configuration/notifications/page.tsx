import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import NotificationToggle from "./NotificationToggle";

export const dynamic = "force-dynamic";

const EVENT_ICON: Record<string, string> = {
  ORGANISATION: "🏢",
  BILLING: "💳",
  INTEGRATION: "🔌",
  SYSTEM: "🩺",
  SECURITY: "🔐",
  REPORTING: "📊",
};

export default async function NotificationsPage() {
  const settings = await prisma.notificationSetting.findMany({
    orderBy: [{ event: "asc" }, { name: "asc" }],
  });

  const grouped = settings.reduce<Record<string, typeof settings>>((acc, n) => {
    (acc[n.event] ??= []).push(n);
    return acc;
  }, {});

  const enabledCount = settings.filter((s) => s.isEnabled).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={`${enabledCount} of ${settings.length} notification types enabled`}
      />

      <div className="space-y-7">
        {Object.entries(grouped).map(([event, items]) => (
          <section key={event}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <span>{EVENT_ICON[event] ?? "🔔"}</span>
              {event}
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {items.length}
              </span>
            </h2>

            <div className="card divide-y divide-slate-100">
              {items.map((n) => (
                <div
                  key={n.id}
                  className="flex flex-wrap items-start gap-4 px-4 py-4 sm:px-5"
                >
                  <div className="min-w-[260px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{n.name}</span>
                      <Badge tone="blue">{n.channel}</Badge>
                      <Badge tone="slate">{n.event}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{n.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {n.recipients.length === 0 && (
                        <span className="text-xs text-slate-400">No recipients configured</span>
                      )}
                      {n.recipients.map((r) => (
                        <span
                          key={r}
                          className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="w-40">
                    <NotificationToggle id={n.id} enabled={n.isEnabled} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
