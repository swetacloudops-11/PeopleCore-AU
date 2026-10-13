import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext, intParam, qs, strParam } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/format";

const PAGE_SIZE = 25;
const VALID_STATUS = ["SUCCESS", "FAILED", "RUNNING", "PARTIAL", "SKIPPED"] as const;

const STATUS_TONE: Record<string, string> = {
  SUCCESS: "green",
  FAILED: "red",
  RUNNING: "blue",
  PARTIAL: "amber",
  SKIPPED: "slate",
};

type Status = (typeof VALID_STATUS)[number];

export default async function PayrollSyncLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();

  const raw = strParam(sp.status).toUpperCase();
  const status: Status | "ALL" = (VALID_STATUS as readonly string[]).includes(raw)
    ? (raw as Status)
    : "ALL";
  const page = intParam(sp.page, 1);

  const where = {
    organisationId,
    ...(status !== "ALL" ? { status } : {}),
  };

  const [total, logs, statusCounts, failedAgg, allTotal] = await Promise.all([
    prisma.syncLog.count({ where }),
    prisma.syncLog.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { integration: { select: { name: true, provider: true } } },
    }),
    prisma.syncLog.groupBy({ by: ["status"], where: { organisationId }, _count: true }),
    prisma.syncLog.aggregate({
      where: { organisationId },
      _sum: { recordsFailed: true },
    }),
    prisma.syncLog.count({ where: { organisationId } }),
  ]);

  const countMap = Object.fromEntries(statusCounts.map((c) => [c.status, c._count]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const failedRecords = failedAgg._sum.recordsFailed ?? 0;

  const chips: { key: Status | "ALL"; label: string; n: number }[] = [
    { key: "ALL", label: "All", n: allTotal },
    ...VALID_STATUS.map((s) => ({
      key: s,
      label: s.charAt(0) + s.slice(1).toLowerCase(),
      n: countMap[s] ?? 0,
    })),
  ];

  return (
    <div>
      <PageHeader
        title="Sync Logs"
        subtitle={`${total} run${total === 1 ? "" : "s"} shown · ${failedRecords.toLocaleString("en-AU")} failed record${failedRecords === 1 ? "" : "s"} on record for ${org.name}`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map((c) => (
          <Link
            key={c.key}
            href={qs({ status: c.key, page: 1 })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              status === c.key
                ? "bg-amber-500 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {c.label} · {c.n}
          </Link>
        ))}
      </div>

      {failedRecords > 0 && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {failedRecords.toLocaleString("en-AU")} record
          {failedRecords === 1 ? "" : "s"} were rejected across all synchronisation runs. Review
          the messages below to find the cause.
        </p>
      )}

      {logs.length === 0 ? (
        <EmptyState
          title={allTotal === 0 ? "No sync logs yet" : "No logs match this filter"}
          hint={
            allTotal === 0
              ? "Run a sync from the Connected Integrations page to populate the log."
              : "Pick a different status to see other runs."
          }
        />
      ) : (
        <>
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Started</th>
                <th className="th">Integration</th>
                <th className="th">Direction</th>
                <th className="th">Trigger</th>
                <th className="th">Status</th>
                <th className="th">Records</th>
                <th className="th">Duration</th>
                <th className="th">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70">
                  <td className="td whitespace-nowrap text-slate-500">
                    <div>{formatDateTime(l.startedAt)}</div>
                    <div className="text-[11px] text-slate-400">{timeAgo(l.startedAt)}</div>
                  </td>
                  <td className="td">
                    <div className="font-medium text-slate-800">{l.integration.name}</div>
                    <div className="text-xs text-slate-400">{l.integration.provider}</div>
                  </td>
                  <td className="td text-slate-500">{l.direction}</td>
                  <td className="td text-slate-500">{l.trigger}</td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[l.status] ?? "slate"}>{l.status}</Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-600">
                    <span className="font-medium text-slate-700">{l.recordsSuccess}</span>
                    <span className="text-slate-400">/{l.recordsTotal}</span>
                    {l.recordsFailed > 0 && (
                      <span className="ml-1 text-[11px] text-rose-500">
                        ({l.recordsFailed} failed)
                      </span>
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {l.durationMs != null ? `${l.durationMs}ms` : "—"}
                  </td>
                  <td className="td max-w-[280px]">
                    <div className="truncate text-xs text-slate-600" title={l.message ?? ""}>
                      {l.message ?? "—"}
                    </div>
                    {l.errorCode && <code className="text-[11px] text-rose-500">{l.errorCode}</code>}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={qs({ status, page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                    ← Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link href={qs({ status, page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                    Next →
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
