import { prisma } from "@/lib/prisma";
import { Badge, TableWrap, EmptyState } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { parseEnum } from "@/lib/enums";
import { MappingStatus } from "@prisma/client";
import MappingActions from "@/components/MappingActions";
import MappingCreateButton from "@/components/MappingCreateButton";
import SyncNowButton from "@/components/SyncNowButton";

export const dynamic = "force-dynamic";

const MAP_TONE: Record<string, string> = {
  CONNECTED: "green",
  DISCONNECTED: "slate",
  ERROR: "red",
  PENDING: "amber",
};

export default async function IntegrationMappingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "ALL";
  const q = sp.q?.trim() ?? "";

  const mappingStatus = parseEnum(MappingStatus, status);
  const mappings = await prisma.organisationIntegration.findMany({
    where: {
      ...(mappingStatus ? { status: mappingStatus } : {}),
      ...(q
        ? {
            OR: [
              { organisation: { name: { contains: q, mode: "insensitive" } } },
              { integration: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 200,
    include: {
      organisation: { select: { name: true, status: true } },
      integration: { select: { name: true, provider: true, category: true } },
    },
  });

  const counts = await prisma.organisationIntegration.groupBy({
    by: ["status"],
    _count: true,
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);

  const buildQuery = (over: Record<string, string>) =>
    `?${new URLSearchParams({ status, q, ...over }).toString()}`;

  const [orgOptions, intOptions] = await Promise.all([
    prisma.organisation.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
    }),
    prisma.integration.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Integration Mapping
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Which integrations are connected to which organisations
          </p>
        </div>
        <MappingCreateButton organisations={orgOptions} integrations={intOptions} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {["ALL", "CONNECTED", "PENDING", "DISCONNECTED", "ERROR"].map((s) => (
          <a
            key={s}
            href={buildQuery({ status: s, q: "" })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              status === s
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "ALL" ? "All" : s} · {s === "ALL" ? totalAll : countMap[s] ?? 0}
          </a>
        ))}
      </div>

      <form method="GET" className="mb-4 flex gap-3">
        <input
          name="q"
          defaultValue={q}
          className="input max-w-sm"
          placeholder="Search organisation or integration…"
        />
        <input type="hidden" name="status" value={status} />
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {mappings.length === 0 ? (
        <EmptyState
          title="No mappings match these filters"
          hint="Connect an integration from the All Integrations screen."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Organisation</th>
              <th className="th">Integration</th>
              <th className="th">External account</th>
              <th className="th">Scopes</th>
              <th className="th">Last sync</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mappings.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50/70">
                <td className="td">
                  <div className="font-medium text-slate-800">{m.organisation.name}</div>
                  {m.organisation.status === "DISABLED" && (
                    <Badge tone="red">ORG DISABLED</Badge>
                  )}
                </td>
                <td className="td">
                  <div className="text-slate-700">{m.integration.name}</div>
                  <div className="text-xs text-slate-400">{m.integration.provider}</div>
                </td>
                <td className="td text-slate-500">
                  {m.externalAccountName ?? m.externalAccountId ?? "—"}
                </td>
                <td className="td">
                  <div className="flex flex-wrap gap-1">
                    {m.scopes.length === 0 && (
                      <span className="text-xs text-slate-400">none</span>
                    )}
                    {m.scopes.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="td text-slate-500">
                  {m.lastSyncAt ? timeAgo(m.lastSyncAt) : "never"}
                  {m.errorMessage && (
                    <div className="max-w-[220px] truncate text-[11px] text-rose-600">
                      {m.errorMessage}
                    </div>
                  )}
                </td>
                <td className="td">
                  <Badge tone={MAP_TONE[m.status] ?? "slate"}>{m.status}</Badge>
                </td>
                <td className="td">
                  <div className="flex items-center justify-end gap-2">
                    <SyncNowButton mappingId={m.id} compact />
                    <MappingActions
                      id={m.id}
                      status={m.status}
                      label={`${m.integration.name} ↔ ${m.organisation.name}`}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
