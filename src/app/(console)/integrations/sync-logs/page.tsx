import { prisma } from "@/lib/prisma";
import { Badge, TableWrap, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { parseEnum } from "@/lib/enums";
import { SyncStatus } from "@prisma/client";
import BulkSyncButton from "@/components/BulkSyncButton";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  SUCCESS: "green",
  FAILED: "red",
  RUNNING: "blue",
  PARTIAL: "amber",
  SKIPPED: "slate",
};

export default async function SyncLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "ALL";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 20;

  const syncStatus = parseEnum(SyncStatus, status);
  const where = syncStatus ? { status: syncStatus } : {};

  const [total, logs, counts] = await Promise.all([
    prisma.syncLog.count({ where }),
    prisma.syncLog.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        organisation: { select: { name: true } },
        integration: { select: { name: true } },
      },
    }),
    prisma.syncLog.groupBy({ by: ["status"], _count: true }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const failedTotal = await prisma.syncLog.aggregate({
    _sum: { recordsFailed: true },
    where: { status: { in: ["FAILED", "PARTIAL"] } },
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Sync Logs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {total} synchronisation run{total === 1 ? "" : "s"} ·{" "}
            {(failedTotal._sum.recordsFailed ?? 0).toLocaleString()} failed records
          </p>
        </div>
        <BulkSyncButton />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {["ALL", "SUCCESS", "FAILED", "PARTIAL", "RUNNING", "SKIPPED"].map((s) => (
          <a
            key={s}
            href={`?${new URLSearchParams({ status: s })}`}
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

      {logs.length === 0 ? (
        <EmptyState title="No sync logs match this filter" />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Started</th>
              <th className="th">Organisation</th>
              <th className="th">Integration</th>
              <th className="th">Direction</th>
              <th className="th">Trigger</th>
              <th className="th">Records</th>
              <th className="th">Duration</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50/70">
                <td className="td whitespace-nowrap text-slate-500">
                  {formatDateTime(l.startedAt)}
                </td>
                <td className="td font-medium text-slate-800">{l.organisation.name}</td>
                <td className="td">{l.integration.name}</td>
                <td className="td text-slate-500">{l.direction}</td>
                <td className="td text-slate-500">{l.trigger}</td>
                <td className="td">
                  <span className="text-slate-700">{l.recordsSuccess}</span>
                  <span className="text-slate-400">/{l.recordsTotal}</span>
                  {l.recordsFailed > 0 && (
                    <span className="ml-1 text-rose-600">({l.recordsFailed} failed)</span>
                  )}
                </td>
                <td className="td text-slate-500">
                  {l.durationMs ? `${(l.durationMs / 1000).toFixed(1)}s` : "—"}
                </td>
                <td className="td">
                  <Badge tone={(TONE[l.status] ?? "slate")}>{l.status}</Badge>
                  {l.errorCode && (
                    <div className="mt-0.5 text-[11px] text-rose-600">{l.errorCode}</div>
                  )}
                  {!l.errorCode && l.message && (
                    <div className="mt-0.5 max-w-[240px] truncate text-[11px] text-slate-400">
                      {l.message}
                    </div>
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
              <a href={`?${new URLSearchParams({ status, page: String(page - 1) })}`} className="btn-secondary">
                ← Previous
              </a>
            )}
            {page < totalPages && (
              <a href={`?${new URLSearchParams({ status, page: String(page + 1) })}`} className="btn-secondary">
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
