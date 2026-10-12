import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext, strParam, qs } from "@/lib/org";
import { Badge, PageHeader, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/format";
import { MappingActions, ConnectButton } from "./IntegrationActions";

export const dynamic = "force-dynamic";

type Search = { q?: string; status?: string };

const STATUS_TONE: Record<string, string> = {
  CONNECTED: "green",
  DISCONNECTED: "slate",
  ERROR: "red",
  PENDING: "amber",
};

const CATEGORY_TONE: Record<string, string> = {
  ACCOUNTING: "purple",
  BANKING: "blue",
  PAYROLL: "green",
  HRIS: "amber",
  IDENTITY: "slate",
  CUSTOM: "blue",
};

export default async function OrgIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { organisationId, org } = await orgContext();
  const sp = await searchParams;
  const q = strParam(sp.q);
  const status = sp.status ?? "ALL";

  const [mappings, catalogue] = await Promise.all([
    // Tenant-scoped: only this organisation's mappings.
    prisma.organisationIntegration.findMany({
      where: { organisationId },
      include: { integration: true },
      orderBy: { updatedAt: "desc" },
    }),
    // The Integration catalogue is global and read-only here.
    prisma.integration.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  const mappedIds = new Set(mappings.map((m) => m.integrationId));
  const available = catalogue.filter((i) => !mappedIds.has(i.id));

  const needle = q.toLowerCase();
  const visible = mappings.filter((m) => {
    if (status !== "ALL" && m.status !== status) return false;
    if (!needle) return true;
    return (
      m.integration.name.toLowerCase().includes(needle) ||
      m.integration.provider.toLowerCase().includes(needle) ||
      (m.externalAccountName ?? "").toLowerCase().includes(needle)
    );
  });

  const countOf = (s: string) => mappings.filter((m) => m.status === s).length;
  const chips = [
    { key: "ALL", label: "All", n: mappings.length },
    { key: "CONNECTED", label: "Connected", n: countOf("CONNECTED") },
    { key: "PENDING", label: "Pending", n: countOf("PENDING") },
    { key: "ERROR", label: "Error", n: countOf("ERROR") },
    { key: "DISCONNECTED", label: "Disconnected", n: countOf("DISCONNECTED") },
  ];

  return (
    <div>
      <PageHeader
        title="Connected Integrations"
        subtitle={`${mappings.length} of ${catalogue.length} catalogue integrations mapped to ${org.name}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Connected" value={countOf("CONNECTED")} hint="Actively syncing" tone="emerald" />
        <StatCard label="Pending" value={countOf("PENDING")} hint="Awaiting first sync" tone="amber" />
        <StatCard label="Errors" value={countOf("ERROR")} hint="Needs attention" tone={countOf("ERROR") ? "rose" : "emerald"} />
        <StatCard label="Available" value={available.length} hint="Not yet mapped" tone="sky" />
      </div>

      {/* Status chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map((c) => (
          <Link
            key={c.key}
            href={qs({ q, status: c.key })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              status === c.key
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {c.label} · {c.n}
          </Link>
        ))}
      </div>

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="q">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Provider, integration or account…"
          />
        </div>
        <input type="hidden" name="status" value={status} />
        <button type="submit" className="btn-secondary">
          Search
        </button>
        {q && (
          <Link href={qs({ status })} className="btn-secondary">
            Reset
          </Link>
        )}
      </form>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">This organisation&apos;s mappings</h2>
        {visible.length === 0 ? (
          <EmptyState
            title={mappings.length === 0 ? "No integrations connected yet" : "No mappings match your filters"}
            hint={
              mappings.length === 0
                ? "Pick an integration from the available list below to connect it."
                : "Try a different search term or status."
            }
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Integration</th>
                <th className="th">Category</th>
                <th className="th">Status</th>
                <th className="th">External account</th>
                <th className="th">Last sync</th>
                <th className="th">Error</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">{m.integration.name}</div>
                    <div className="text-xs text-slate-400">
                      {m.integration.provider} · {m.integration.status.toLowerCase()}
                    </div>
                  </td>
                  <td className="td">
                    <Badge tone={CATEGORY_TONE[m.integration.category] ?? "slate"}>
                      {m.integration.category}
                    </Badge>
                  </td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[m.status] ?? "slate"}>{m.status}</Badge>
                  </td>
                  <td className="td text-slate-500">
                    {m.externalAccountName ?? <span className="text-slate-400">—</span>}
                    {m.scopes.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {m.scopes.map((s) => (
                          <span
                            key={s}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {m.lastSyncAt ? (
                      <>
                        <div>{formatDateTime(m.lastSyncAt)}</div>
                        <div className="text-[11px] text-slate-400">{timeAgo(m.lastSyncAt)}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">Never</span>
                    )}
                    {m.lastSyncStatus && (
                      <div className="mt-0.5">
                        <Badge tone={m.lastSyncStatus === "SUCCESS" ? "green" : "red"}>
                          {m.lastSyncStatus}
                        </Badge>
                      </div>
                    )}
                  </td>
                  <td className="td max-w-[220px]">
                    {m.errorMessage ? (
                      <span className="text-xs text-rose-600">{m.errorMessage}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="td">
                    <MappingActions id={m.id} status={m.status} name={m.integration.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Available integrations</h2>
          <span className="text-xs text-slate-400">
            {available.length} not yet mapped to this organisation
          </span>
        </div>

        {available.length === 0 ? (
          <EmptyState
            title="Everything is connected"
            hint="Every integration in the catalogue is already mapped to this organisation."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((i) => (
              <div key={i.id} className="card flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{i.name}</div>
                    <div className="text-xs text-slate-400">{i.provider}</div>
                  </div>
                  <Badge tone={CATEGORY_TONE[i.category] ?? "slate"}>{i.category}</Badge>
                </div>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-500">
                  {i.description ?? "No description provided."}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Badge tone={i.status === "ACTIVE" ? "green" : "amber"}>
                    {i.status === "ACTIVE" ? "Available" : i.status}
                  </Badge>
                  <ConnectButton integrationId={i.id} name={i.name} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
