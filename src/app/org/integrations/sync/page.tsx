import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext, intParam, qs } from "@/lib/org";
import { Badge, PageHeader, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, ColumnChart, StackedBar, type DonutSegment } from "@/components/charts";
import { formatDateTime, timeAgo } from "@/lib/format";
import RunSyncButton from "./RunSyncButton";

export const dynamic = "force-dynamic";

type Search = { status?: string; page?: string };

const STATUS_TONE: Record<string, string> = {
  SUCCESS: "green",
  FAILED: "red",
  RUNNING: "blue",
  PARTIAL: "amber",
  SKIPPED: "slate",
};

export default async function OrgSyncStatusPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { organisationId } = await orgContext();
  const sp = await searchParams;
  const VALID_STATUS = ["SUCCESS", "FAILED", "RUNNING", "PARTIAL", "SKIPPED"] as const;
  const status = VALID_STATUS.includes(sp.status as (typeof VALID_STATUS)[number])
    ? (sp.status as (typeof VALID_STATUS)[number])
    : "ALL";
  const page = intParam(sp.page, 1);
  const pageSize = 25;

  const where = {
    organisationId,
    ...(status !== "ALL" ? { status } : {}),
  };

  const [agg, statusCounts, filtered, recent, mappings, connectedMappings, trend] =
    await Promise.all([
      prisma.syncLog.aggregate({
        where: { organisationId },
        _sum: { recordsSuccess: true, recordsFailed: true },
        _avg: { durationMs: true },
        _count: true,
      }),
      prisma.syncLog.groupBy({
        by: ["status"],
        where: { organisationId },
        _count: true,
      }),
      prisma.syncLog.count({ where }),
      prisma.syncLog.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { integration: { select: { name: true, provider: true, category: true } } },
      }),
      prisma.organisationIntegration.findMany({
        where: { organisationId },
        orderBy: { updatedAt: "desc" },
        include: { integration: { select: { name: true } } },
      }),
      prisma.organisationIntegration.count({
        where: { organisationId, status: "CONNECTED" },
      }),
      prisma.syncLog.findMany({
        where: { organisationId },
        orderBy: { startedAt: "asc" },
        take: 14,
        select: { startedAt: true, durationMs: true, status: true },
      }),
    ]);

  const total = agg._count;
  const countMap = Object.fromEntries(statusCounts.map((c) => [c.status, c._count]));
  const successCount = countMap.SUCCESS ?? 0;
  const failedCount = countMap.FAILED ?? 0;
  const successRate = total === 0 ? 0 : Math.round((successCount / total) * 100);
  const totalPages = Math.max(1, Math.ceil(filtered / pageSize));

  const chips = ["ALL", "SUCCESS", "PARTIAL", "FAILED", "SKIPPED"].map((key) => ({
    key,
    label: key === "ALL" ? "All" : key.charAt(0) + key.slice(1).toLowerCase(),
    n: key === "ALL" ? total : countMap[key] ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Sync Status"
        subtitle={`${total} synchronisation run${total === 1 ? "" : "s"} recorded for this organisation`}
        action={{ label: "Connected integrations", href: "/org/integrations" }}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Success rate"
          value={`${successRate}%`}
          hint={`${successCount}/${total} runs succeeded`}
          tone={successRate >= 90 ? "emerald" : successRate >= 70 ? "amber" : "rose"}
        />
        <StatCard
          label="Failed runs"
          value={failedCount}
          hint={failedCount ? "Inspect error codes below" : "No failures"}
          tone={failedCount ? "rose" : "emerald"}
        />
        <StatCard
          label="Records synced"
          value={(agg._sum.recordsSuccess ?? 0).toLocaleString("en-AU")}
          hint={`${(agg._sum.recordsFailed ?? 0).toLocaleString("en-AU")} failed`}
          tone="indigo"
        />
        <StatCard
          label="Avg duration"
          value={`${Math.round(Number(agg._avg.durationMs ?? 0))}ms`}
          hint={`${connectedMappings} connected mapping(s)`}
          tone="sky"
        />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
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

        <ChartPanel title="Records processed" subtitle="Succeeded vs failed record volume">
          <div className="pt-3">
            <StackedBar
              segments={[
                { label: "Succeeded", value: Number(agg._sum.recordsSuccess ?? 0), tone: "emerald" },
                { label: "Failed", value: Number(agg._sum.recordsFailed ?? 0), tone: "rose" },
              ]}
              height={16}
            />
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              <strong className="text-slate-800">
                {(agg._sum.recordsSuccess ?? 0).toLocaleString()}
              </strong>{" "}
              records made it through,{" "}
              <strong className="text-rose-600">
                {(agg._sum.recordsFailed ?? 0).toLocaleString()}
              </strong>{" "}
              were rejected across {total} run{total === 1 ? "" : "s"}.
            </p>
          </div>
        </ChartPanel>

        <ChartPanel title="Run duration" subtitle="Last 14 synchronisations (ms)">
          {trend.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No runs yet</p>
          ) : (
            <ColumnChart
              points={trend.map((t) => ({
                label: t.startedAt.toLocaleDateString("en-AU", { day: "2-digit" }),
                value: t.durationMs ?? 0,
                color:
                  t.status === "FAILED" ? "#f43f5e" : t.status === "PARTIAL" ? "#f59e0b" : "#0ea5e9",
              }))}
              height={124}
              valueFormat={(v) => `${v}ms`}
            />
          )}
        </ChartPanel>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <Link
              key={c.key}
              href={qs({ status: c.key, page: 1 })}
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

        <RunSyncButton
          mappings={mappings.map((m) => ({ id: m.id, name: m.integration.name }))}
        />
      </div>

      {recent.length === 0 ? (
        <EmptyState
          title={total === 0 ? "No sync runs yet" : "No runs match this filter"}
          hint={
            total === 0
              ? "Run a sync to see record counts, durations and outcomes here."
              : "Pick a different status to see other runs."
          }
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Started</th>
              <th className="th">Integration</th>
              <th className="th">Status</th>
              <th className="th">Direction</th>
              <th className="th">Trigger</th>
              <th className="th">Records</th>
              <th className="th">Duration</th>
              <th className="th">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {recent.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50/70">
                <td className="td whitespace-nowrap text-slate-500">
                  <div>{formatDateTime(l.startedAt)}</div>
                  <div className="text-[11px] text-slate-400">{timeAgo(l.startedAt)}</div>
                </td>
                <td className="td">
                  <div className="font-medium text-slate-800">{l.integration.name}</div>
                  <div className="text-xs text-slate-400">{l.integration.provider}</div>
                </td>
                <td className="td">
                  <Badge tone={STATUS_TONE[l.status] ?? "slate"}>{l.status}</Badge>
                </td>
                <td className="td text-slate-500">{l.direction}</td>
                <td className="td text-slate-500">{l.trigger}</td>
                <td className="td whitespace-nowrap text-slate-600">
                  {l.recordsSuccess}/{l.recordsTotal}
                  {l.recordsFailed > 0 && (
                    <span className="ml-1 text-[11px] text-rose-500">({l.recordsFailed} failed)</span>
                  )}
                </td>
                <td className="td whitespace-nowrap text-slate-500">
                  {l.durationMs != null ? `${l.durationMs}ms` : "—"}
                </td>
                <td className="td max-w-[280px]">
                  <div className="truncate text-xs text-slate-600" title={l.message ?? ""}>
                    {l.message ?? "—"}
                  </div>
                  {l.errorCode && (
                    <code className="text-[11px] text-rose-500">{l.errorCode}</code>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ status, page: page - 1 })} className="btn-secondary">
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={qs({ status, page: page + 1 })} className="btn-secondary">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
