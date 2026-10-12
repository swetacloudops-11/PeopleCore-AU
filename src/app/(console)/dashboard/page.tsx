import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, Badge, TableWrap } from "@/components/ui";
import { formatDateTime, formatMoney, timeAgo } from "@/lib/format";

const NAV_TILES = [
  { label: "Organisations", icon: "🏢", href: "/organisations", desc: "All, create, disabled" },
  { label: "Subscriptions", icon: "💳", href: "/subscriptions/plans", desc: "Plans & billing" },
  { label: "Integrations", icon: "🔌", href: "/integrations", desc: "Mapping & sync logs" },
  { label: "System Config", icon: "⚙️", href: "/configuration/business-rules", desc: "Rules, permissions, alerts" },
  { label: "Diagnostics", icon: "🩺", href: "/diagnostics/system-health", desc: "Health, errors, jobs" },
  { label: "Security", icon: "🔐", href: "/security/roles", desc: "Roles, perms, sessions" },
  { label: "Audit Logs", icon: "📋", href: "/audit-logs", desc: "Full activity trail" },
  { label: "Settings", icon: "🧩", href: "/settings", desc: "Platform preferences" },
];

export default async function DashboardPage() {
  const [
    totalOrgs,
    activeOrgs,
    disabledOrgs,
    activeSubs,
    trialingSubs,
    connectedMappings,
    failedSyncs,
    openErrors,
    runningJobs,
    failedJobs,
    activeSessions,
    recentAudit,
    recentSync,
  ] = await Promise.all([
    prisma.organisation.count(),
    prisma.organisation.count({ where: { status: "ACTIVE" } }),
    prisma.organisation.count({ where: { status: "DISABLED" } }),
    prisma.organisationSubscription.count({ where: { status: "ACTIVE" } }),
    prisma.organisationSubscription.count({ where: { status: "TRIALING" } }),
    prisma.organisationIntegration.count({ where: { status: "CONNECTED" } }),
    prisma.syncLog.count({ where: { status: "FAILED" } }),
    prisma.errorLog.count({ where: { resolved: false } }),
    prisma.job.count({ where: { status: "RUNNING" } }),
    prisma.job.count({ where: { status: "FAILED" } }),
    prisma.userSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.auditLog.findMany({ take: 8, orderBy: { createdAt: "desc" } }),
    prisma.syncLog.findMany({
      take: 6,
      orderBy: { startedAt: "desc" },
      include: { organisation: { select: { name: true } }, integration: { select: { name: true } } },
    }),
  ]);

  const mrr = await prisma.organisationSubscription.aggregate({
    _sum: { amount: true },
    where: { status: { in: ["ACTIVE", "TRIALING"] }, cycle: "MONTHLY" },
  });
  const arr = await prisma.organisationSubscription.aggregate({
    _sum: { amount: true },
    where: { status: { in: ["ACTIVE", "TRIALING"] }, cycle: "ANNUAL" },
  });
  const mrrTotal = Number(mrr._sum.amount ?? 0) + Number(arr._sum.amount ?? 0) / 12;

  const syncTone = (s: string) =>
    s === "SUCCESS" ? "green" : s === "FAILED" ? "red" : s === "PARTIAL" ? "amber" : "slate";

  const sevTone = (s: string) =>
    s === "CRITICAL" ? "red" : s === "ERROR" ? "red" : s === "WARNING" ? "amber" : "blue";

  const errors = await prisma.errorLog.findMany({
    where: { resolved: false },
    take: 5,
    orderBy: { occurredAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Platform-wide overview of PeopleCore AU"
        action={{ label: "Create Organisation", href: "/organisations/create" }}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Organisations" value={totalOrgs} hint={`${activeOrgs} active · ${disabledOrgs} disabled`} tone="indigo" />
        <StatCard label="Active subscriptions" value={activeSubs} hint={`${trialingSubs} on trial`} tone="emerald" />
        <StatCard label="Monthly recurring revenue" value={formatMoney(mrrTotal)} hint="Excl. GST" tone="sky" />
        <StatCard label="Connected integrations" value={connectedMappings} hint={`${failedSyncs} failed syncs`} tone="amber" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Open errors" value={openErrors} hint="Awaiting triage" tone={openErrors > 0 ? "rose" : "emerald"} />
        <StatCard label="Jobs running" value={runningJobs} hint={`${failedJobs} failed recently`} tone="indigo" />
        <StatCard label="Active sessions" value={activeSessions} hint="Signed-in administrators" tone="sky" />
        <StatCard label="Audit events" value={await prisma.auditLog.count()} hint="All time" tone="amber" />
      </div>

      {/* Quick navigation */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {NAV_TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="card group p-3 text-center transition hover:border-indigo-300 hover:shadow"
          >
            <div className="text-xl">{t.icon}</div>
            <div className="mt-1 text-xs font-semibold text-slate-700 group-hover:text-indigo-700">
              {t.label}
            </div>
            <div className="mt-0.5 text-[10px] leading-tight text-slate-400">{t.desc}</div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Recent sync activity */}
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Recent integration syncs</h2>
            <Link href="/integrations/sync-logs" className="text-xs font-medium text-indigo-600 hover:underline">
              View all →
            </Link>
          </div>
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Organisation</th>
                <th className="th">Integration</th>
                <th className="th">Status</th>
                <th className="th">Records</th>
                <th className="th">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentSync.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="td font-medium text-slate-800">{s.organisation.name}</td>
                  <td className="td">{s.integration.name}</td>
                  <td className="td">
                    <Badge tone={syncTone(s.status)}>{s.status}</Badge>
                  </td>
                  <td className="td text-slate-500">
                    {s.recordsSuccess}/{s.recordsTotal}
                  </td>
                  <td className="td text-slate-500">{timeAgo(s.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>

        {/* Open errors */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Open errors</h2>
            <Link href="/diagnostics/errors" className="text-xs font-medium text-indigo-600 hover:underline">
              All →
            </Link>
          </div>
          <div className="card divide-y divide-slate-100">
            {errors.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No open errors 🎉</p>
            )}
            {errors.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium leading-snug text-slate-700">{e.message}</p>
                  <Badge tone={sevTone(e.severity)}>{e.severity}</Badge>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {e.source} · {timeAgo(e.occurredAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Audit trail */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Latest audit activity</h2>
          <Link href="/audit-logs" className="text-xs font-medium text-indigo-600 hover:underline">
            Full audit log →
          </Link>
        </div>
        <div className="card divide-y divide-slate-100">
          {recentAudit.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Badge tone={a.severity === "WARNING" ? "amber" : a.severity === "ERROR" ? "red" : "blue"}>
                {a.category}
              </Badge>
              <span className="flex-1 text-sm text-slate-700">{a.description}</span>
              <span className="text-xs text-slate-400">{formatDateTime(a.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
