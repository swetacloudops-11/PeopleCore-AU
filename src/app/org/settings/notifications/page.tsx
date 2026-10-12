import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { PageHeader, StatCard, Badge } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/format";
import SettingsEditor, { type SettingDto } from "../settings-editor";

export const dynamic = "force-dynamic";

export default async function OrgNotificationSettingsPage() {
  const { organisationId } = await orgContext();

  const [rows, recent] = await Promise.all([
    prisma.orgSetting.findMany({
      where: { organisationId, group: "notifications" },
      orderBy: { key: "asc" },
    }),
    prisma.orgNotification.findMany({
      where: { organisationId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const settings: SettingDto[] = rows.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    value: s.value,
    dataType: s.dataType,
    isSecret: s.isSecret,
  }));

  const toggles = rows.filter((r) => r.dataType === "boolean").length;
  const enabled = rows.filter((r) => r.dataType === "boolean" && r.value === "true").length;
  const unread = await prisma.orgNotification.count({
    where: { organisationId, isRead: false },
  });

  return (
    <div>
      <PageHeader
        title="Notification Settings"
        subtitle="Choose which events notify managers and admins for this organisation"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Notification rules" value={settings.length} hint="Group: notifications" tone="indigo" />
        <StatCard label="Toggles on" value={enabled} hint={`${toggles} toggles total`} tone="emerald" />
        <StatCard label="Toggles off" value={toggles - enabled} hint="Notifications silenced" tone="amber" />
        <StatCard label="Unread feed items" value={unread} hint="Recent notifications" tone="sky" />
      </div>

      <SettingsEditor settings={settings} group="notifications" />

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Recent notification feed</h2>
          <Link href="/org/dashboard" className="text-xs text-indigo-600 hover:underline">
            Open dashboard →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="card px-4 py-8 text-center text-sm text-slate-500">
            No notifications have been raised yet.
          </div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {recent.map((n) => (
              <div key={n.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    n.isRead ? "bg-slate-300" : "bg-indigo-500"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{n.title}</span>
                    <Badge tone="slate">{n.event}</Badge>
                    {n.isRead ? (
                      <Badge tone="slate">READ</Badge>
                    ) : (
                      <Badge tone="blue">UNREAD</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-slate-500">{n.body}</p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-400">
                  {formatDateTime(n.createdAt)} · {timeAgo(n.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
