import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney, timeAgo } from "@/lib/format";
import OrgEditForm from "@/components/OrgEditForm";
import OrgQuickActions from "@/components/OrgQuickActions";
import SyncNowButton from "@/components/SyncNowButton";

export default async function OrganisationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const org = await prisma.organisation.findUnique({
    where: { id },
    include: {
      subscriptions: {
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      },
      integrations: {
        include: { integration: true },
        orderBy: { updatedAt: "desc" },
      },
      syncLogs: {
        orderBy: { startedAt: "desc" },
        take: 8,
        include: { integration: { select: { name: true } } },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });

  if (!org) notFound();

  const sub = org.subscriptions[0];
  const connected = org.integrations.filter((m) => m.status === "CONNECTED").length;
  const succeeded = org.syncLogs.filter((l) => l.status === "SUCCESS").length;
  const statusTone = org.status === "ACTIVE" ? "green" : org.status === "DISABLED" ? "red" : "amber";

  return (
    <div>
      <div className="mb-4">
        <Link href="/organisations" className="text-sm text-indigo-600 hover:underline">
          ← Back to organisations
        </Link>
      </div>

      <PageHeader title={org.name} subtitle={`${org.slug} · created ${formatDate(org.createdAt)}`} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone as string}>{org.status}</Badge>
          {sub && <Badge tone="blue">{sub.plan.name}</Badge>}
          <Badge tone="slate">{connected}/{org.integrations.length} integrations</Badge>
          {org.disabledReason && (
            <span className="text-xs text-rose-600">Reason: {org.disabledReason}</span>
          )}
        </div>
        <OrgQuickActions id={org.id} name={org.name} status={org.status} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Employees" value={org.employeeCount} tone="indigo" />
        <StatCard
          label="Monthly value"
          value={sub ? formatMoney(sub.amount, sub.currency) : "—"}
          hint={sub ? `${sub.cycle} · ${sub.seats} seats` : "No subscription"}
          tone="sky"
        />
        <StatCard
          label="Integrations"
          value={connected}
          hint={`${org.integrations.length} mapped`}
          tone="emerald"
        />
        <StatCard
          label="Sync success"
          value={org.syncLogs.length ? `${Math.round((succeeded / org.syncLogs.length) * 100)}%` : "—"}
          hint={`${org.syncLogs.length} recent runs`}
          tone={succeeded === org.syncLogs.length ? "emerald" : "amber"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Edit details</h2>
          <OrgEditForm
            org={{
              id: org.id,
              name: org.name,
              abn: org.abn,
              email: org.email,
              phone: org.phone,
              industry: org.industry,
              addressLine1: org.addressLine1,
              city: org.city,
              state: org.state,
              postcode: org.postcode,
              employeeCount: org.employeeCount,
              status: org.status,
            }}
          />
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Profile</h2>
            <div className="card divide-y divide-slate-100 text-sm">
              {[
                ["ABN", org.abn || "—"],
                ["Email", org.email || "—"],
                ["Phone", org.phone || "—"],
                ["Industry", org.industry || "—"],
                ["Address", [org.addressLine1, org.city, org.state].filter(Boolean).join(", ") || "—"],
                ["Postcode", org.postcode || "—"],
                ["Country", org.country],
                ["Status", org.status],
                ["Created", formatDate(org.createdAt)],
                ["Last updated", formatDateTime(org.updatedAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <span className="shrink-0 text-xs text-slate-400">{k}</span>
                  <span className="break-words text-right text-slate-700">{v}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Integrations</h2>
              <Link href="/integrations/mapping" className="text-xs text-indigo-600 hover:underline">
                Manage →
              </Link>
            </div>
            <div className="card divide-y divide-slate-100">
              {org.integrations.length === 0 && (
                <p className="px-4 py-5 text-center text-sm text-slate-500">
                  No integrations mapped
                </p>
              )}
              {org.integrations.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-700">
                      {m.integration.name}
                    </div>
                    <div className="truncate text-[11px] text-slate-400">
                      {m.lastSyncAt ? `last sync ${timeAgo(m.lastSyncAt)}` : "never synced"}
                    </div>
                  </div>
                  <Badge
                    tone={
                      m.status === "CONNECTED"
                        ? "green"
                        : m.status === "ERROR"
                        ? "red"
                        : m.status === "PENDING"
                        ? "amber"
                        : "slate"
                    }
                  >
                    {m.status}
                  </Badge>
                  <SyncNowButton mappingId={m.id} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Recent sync activity</h2>
          {org.syncLogs.length === 0 ? (
            <EmptyState title="No sync runs yet" hint="Trigger one from the integrations list." />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Started</th>
                  <th className="th">Integration</th>
                  <th className="th">Records</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {org.syncLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="td whitespace-nowrap text-slate-500">
                      {formatDateTime(l.startedAt)}
                    </td>
                    <td className="td">{l.integration.name}</td>
                    <td className="td text-slate-500">
                      {l.recordsSuccess}/{l.recordsTotal}
                    </td>
                    <td className="td">
                      <Badge
                        tone={
                          l.status === "SUCCESS"
                            ? "green"
                            : l.status === "FAILED"
                            ? "red"
                            : l.status === "PARTIAL"
                            ? "amber"
                            : "slate"
                        }
                      >
                        {l.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Audit history</h2>
          <div className="card divide-y divide-slate-100">
            {org.auditLogs.length === 0 && (
              <p className="px-4 py-5 text-center text-sm text-slate-500">No audit records</p>
            )}
            {org.auditLogs.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[11px] font-medium text-slate-600">{a.action}</code>
                  <span className="text-[11px] text-slate-400">{timeAgo(a.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{a.description}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {a.user?.email ?? "system"}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
