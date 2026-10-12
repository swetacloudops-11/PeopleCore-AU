import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, StatCard } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function IntegrationHealthPage() {
  const mappings = await prisma.organisationIntegration.findMany({
    include: {
      integration: { select: { name: true, provider: true, category: true, status: true } },
      organisation: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const integrations = await prisma.integration.findMany({
    orderBy: { name: "asc" },
    include: {
      mappings: { select: { status: true } },
      syncLogs: {
        orderBy: { startedAt: "desc" },
        take: 20,
        select: { status: true, startedAt: true, durationMs: true },
      },
    },
  });

  const connected = mappings.filter((m) => m.status === "CONNECTED").length;
  const errored = mappings.filter((m) => m.status === "ERROR").length;
  const pending = mappings.filter((m) => m.status === "PENDING").length;
  const disconnected = mappings.filter((m) => m.status === "DISCONNECTED").length;

  const overallPct =
    mappings.length === 0 ? 100 : Math.round((connected / mappings.length) * 100);

  const withIssues = mappings.filter((m) => m.status === "ERROR");

  return (
    <div>
      <PageHeader
        title="Integration Health"
        subtitle="Connectivity and synchronisation health across every connector"
      />

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-500">Overall connectivity</div>
            <div className="mt-1 text-3xl font-semibold text-slate-900">{overallPct}%</div>
            <div className="mt-1 text-xs text-slate-400">
              {connected} of {mappings.length} mappings connected
            </div>
          </div>
          <div className="min-w-[220px] flex-[2]">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${
                  overallPct >= 80
                    ? "bg-emerald-500"
                    : overallPct >= 50
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-slate-400">
              <span>0%</span>
              <span>Target 95%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Connected" value={connected} tone="emerald" />
        <StatCard label="Errors" value={errored} hint="Need re-authorisation" tone={errored ? "rose" : "emerald"} />
        <StatCard label="Pending" value={pending} hint="Awaiting setup" tone="sky" />
        <StatCard label="Disconnected" value={disconnected} tone="amber" />
      </div>

      {withIssues.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-700">
            ⚠ Mappings requiring attention
          </h2>
          <div className="card divide-y divide-slate-100">
            {withIssues.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Badge tone="red">ERROR</Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">
                    {m.organisation.name} → {m.integration.name}
                  </div>
                  <div className="truncate text-xs text-rose-600">
                    {m.errorMessage ?? "Unknown connection error"}
                  </div>
                </div>
                <span className="text-xs text-slate-400">
                  {m.lastSyncAt ? `last sync ${timeAgo(m.lastSyncAt)}` : "never synced"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Connector reliability (last 20 runs each)
        </h2>
        <div className="card divide-y divide-slate-100">
          {integrations.map((it) => {
            const runs = it.syncLogs;
            const ok = runs.filter((r) => r.status === "SUCCESS").length;
            const failed = runs.filter((r) => r.status === "FAILED").length;
            const partial = runs.filter((r) => r.status === "PARTIAL").length;
            const pct = runs.length ? Math.round((ok / runs.length) * 100) : null;
            const avg = runs.length
              ? runs.reduce((a, r) => a + (r.durationMs ?? 0), 0) / runs.length
              : 0;

            const tone =
              pct === null
                ? "slate"
                : pct >= 90
                ? "green"
                : pct >= 70
                ? "amber"
                : "red";

            return (
              <div key={it.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{it.name}</span>
                    <Badge tone={it.status === "ACTIVE" ? "green" : "slate"}>{it.status}</Badge>
                  </div>
                  <div className="text-xs text-slate-400">
                    {it.mappings.length} mapping{it.mappings.length === 1 ? "" : "s"} ·{" "}
                    {it.mappings.filter((m) => m.status === "CONNECTED").length} connected
                  </div>
                </div>

                <div className="w-40">
                  {pct === null ? (
                    <span className="text-xs text-slate-400">No runs yet</span>
                  ) : (
                    <>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${
                            tone === "green"
                              ? "bg-emerald-500"
                              : tone === "amber"
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                        <span>{pct}% success</span>
                        <span>{(avg / 1000).toFixed(1)}s avg</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-1.5">
                  {runs.length === 0 && (
                    <span className="text-xs text-slate-400">no history</span>
                  )}
                  {runs.map((r, i) => (
                    <span
                      key={i}
                      title={`${r.status} · ${timeAgo(r.startedAt)}`}
                      className={`h-5 w-1.5 rounded-full ${
                        r.status === "SUCCESS"
                          ? "bg-emerald-400"
                          : r.status === "FAILED"
                          ? "bg-rose-500"
                          : r.status === "PARTIAL"
                          ? "bg-amber-400"
                          : "bg-slate-300"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex gap-2 text-xs">
                  {failed > 0 && <span className="text-rose-600">{failed} failed</span>}
                  {partial > 0 && <span className="text-amber-600">{partial} partial</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
