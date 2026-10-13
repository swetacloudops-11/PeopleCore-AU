import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import {
  ChartPanel,
  ColumnChart,
  Donut,
  type DonutSegment,
} from "@/components/charts";
import { formatDateTime, timeAgo } from "@/lib/format";

const STATUS_TONE: Record<string, string> = {
  SUCCESS: "green",
  FAILED: "red",
  RUNNING: "blue",
  PARTIAL: "amber",
  SKIPPED: "slate",
};

export default async function PayrollSyncStatusPage() {
  const { organisationId, org } = await payrollContext();

  const [total, statusCounts, lastTen, mostRecent, mappings, runCounts] = await Promise.all([
    prisma.syncLog.count({ where: { organisationId } }),
    prisma.syncLog.groupBy({ by: ["status"], where: { organisationId }, _count: true }),
    prisma.syncLog.findMany({
      where: { organisationId },
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { integration: { select: { name: true } } },
    }),
    prisma.syncLog.findFirst({
      where: { organisationId },
      orderBy: { startedAt: "desc" },
      include: { integration: { select: { name: true, provider: true } } },
    }),
    prisma.organisationIntegration.findMany({
      where: { organisationId },
      orderBy: { updatedAt: "desc" },
      include: { integration: { select: { name: true, provider: true } } },
    }),
    prisma.syncLog.groupBy({
      by: ["integrationId"],
      where: { organisationId },
      _count: true,
      _max: { startedAt: true },
    }),
  ]);

  const countMap = Object.fromEntries(statusCounts.map((c) => [c.status, c._count]));
  const successCount = countMap.SUCCESS ?? 0;
  const failedCount = countMap.FAILED ?? 0;
  const partialCount = countMap.PARTIAL ?? 0;
  const successRate = total === 0 ? 0 : Math.round((successCount / total) * 100);

  const runsByIntegration = new Map<string, number>(
    runCounts.map((r): [string, number] => [r.integrationId, r._count])
  );

  // Oldest → newest so the column chart reads left to right.
  const syncPoints = [...lastTen].reverse().map((l) => ({
    label: l.startedAt.toLocaleDateString("en-AU", { day: "2-digit", month: "short" }),
    value: l.recordsSuccess,
    color:
      l.status === "FAILED"
        ? "#f43f5e"
        : l.status === "PARTIAL"
        ? "#f59e0b"
        : l.status === "SKIPPED"
        ? "#64748b"
        : "#10b981",
  }));

  return (
    <div>
      <PageHeader
        title="Sync Status"
        subtitle={`${total} synchronisation run${total === 1 ? "" : "s"} recorded for ${org.name}`}
        action={{ label: "Sync logs", href: "/payroll/integrations/logs" }}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total runs" value={total} hint="All synchronisations" tone="indigo" />
        <StatCard
          label="Success rate"
          value={`${successRate}%`}
          hint={`${successCount}/${total} succeeded`}
          tone={successRate >= 90 ? "emerald" : successRate >= 70 ? "amber" : "rose"}
        />
        <StatCard
          label="Failed"
          value={failedCount}
          hint={failedCount ? "Inspect the logs" : "No failures"}
          tone={failedCount ? "rose" : "emerald"}
        />
        <StatCard label="Partial" value={partialCount} hint="Completed with rejections" tone="amber" />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Run outcomes" subtitle="Every synchronisation attempt">
          <Donut
            segments={(
              [
                { label: "Success", value: countMap.SUCCESS ?? 0, tone: "emerald" },
                { label: "Failed", value: countMap.FAILED ?? 0, tone: "rose" },
                { label: "Partial", value: countMap.PARTIAL ?? 0, tone: "amber" },
                { label: "Running", value: countMap.RUNNING ?? 0, tone: "sky" },
                { label: "Skipped", value: countMap.SKIPPED ?? 0, tone: "slate" },
              ] as DonutSegment[]
            ).filter((s) => s.value > 0)}
            size={132}
            thickness={16}
            centerValue={`${successRate}%`}
            centerLabel="success"
          />
        </ChartPanel>

        <ChartPanel title="Records synced per run" subtitle="Last 10 synchronisations">
          <ColumnChart points={syncPoints} tone="emerald" height={128} />
        </ChartPanel>
      </div>

      {mostRecent ? (
        <section className="mb-6 card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Most recent run</h2>
            <Badge tone={STATUS_TONE[mostRecent.status] ?? "slate"}>{mostRecent.status}</Badge>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">Integration</dt>
              <dd className="font-medium text-slate-800">{mostRecent.integration.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Started</dt>
              <dd className="text-slate-700">
                {formatDateTime(mostRecent.startedAt)}
                <span className="ml-1 text-slate-400">· {timeAgo(mostRecent.startedAt)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Records</dt>
              <dd className="text-slate-700">
                {mostRecent.recordsSuccess}/{mostRecent.recordsTotal}
                {mostRecent.recordsFailed > 0 && (
                  <span className="ml-1 text-rose-600">({mostRecent.recordsFailed} failed)</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Duration</dt>
              <dd className="text-slate-700">
                {mostRecent.durationMs != null ? `${mostRecent.durationMs}ms` : "—"}
              </dd>
            </div>
          </dl>
          {mostRecent.message && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {mostRecent.message}
            </p>
          )}
        </section>
      ) : (
        <div className="mb-6">
          <EmptyState
            title="No sync runs yet"
            hint="Once an integration syncs, its latest outcome will be summarised here."
          />
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Integration health</h2>
        {mappings.length === 0 ? (
          <EmptyState title="No integrations connected" hint="Connect a provider to start syncing." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Integration</th>
                <th className="th">Status</th>
                <th className="th">Runs</th>
                <th className="th">Last run status</th>
                <th className="th">Last sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mappings.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">{m.integration.name}</div>
                    <div className="text-xs text-slate-400">{m.integration.provider}</div>
                  </td>
                  <td className="td">
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
                  </td>
                  <td className="td text-slate-600">{runsByIntegration.get(m.integrationId) ?? 0}</td>
                  <td className="td">
                    {m.lastSyncStatus ? (
                      <Badge tone={STATUS_TONE[m.lastSyncStatus] ?? "slate"}>{m.lastSyncStatus}</Badge>
                    ) : (
                      <span className="text-slate-400">Never run</span>
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {m.lastSyncAt ? (
                      <>
                        {formatDateTime(m.lastSyncAt)}
                        <div className="text-[11px] text-slate-400">{timeAgo(m.lastSyncAt)}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}
