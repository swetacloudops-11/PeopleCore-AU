import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, TableWrap, EmptyState, StatCard } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/format";
import { parseEnum } from "@/lib/enums";
import { JobStatus } from "@prisma/client";
import JobActions from "@/components/JobActions";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  QUEUED: "slate",
  RUNNING: "blue",
  SUCCEEDED: "green",
  FAILED: "red",
  CANCELLED: "amber",
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "ALL";

  const statusFilter = parseEnum(JobStatus, status);
  const [jobs, counts] = await Promise.all([
    prisma.job.findMany({
      where: statusFilter ? { status: statusFilter } : {},
      orderBy: { queuedAt: "desc" },
      take: 100,
    }),
    prisma.job.groupBy({ by: ["status"], _count: true }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);

  const avgDuration = await prisma.job.aggregate({
    _avg: { durationMs: true },
    where: { status: "SUCCEEDED" },
  });

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle={`${totalAll} background jobs · avg success time ${(
          (avgDuration._avg.durationMs ?? 0) / 1000
        ).toFixed(1)}s`}
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Queued" value={countMap.QUEUED ?? 0} tone="sky" />
        <StatCard label="Running" value={countMap.RUNNING ?? 0} tone="indigo" />
        <StatCard label="Succeeded" value={countMap.SUCCEEDED ?? 0} tone="emerald" />
        <StatCard label="Failed" value={countMap.FAILED ?? 0} tone={countMap.FAILED ? "rose" : "emerald"} />
        <StatCard label="Cancelled" value={countMap.CANCELLED ?? 0} tone="amber" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {["ALL", "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"].map((s) => (
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

      {jobs.length === 0 ? (
        <EmptyState title="No jobs match this filter" />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Job</th>
              <th className="th">Queue</th>
              <th className="th">Status</th>
              <th className="th">Attempts</th>
              <th className="th">Duration</th>
              <th className="th">Queued</th>
              <th className="th">Result / Error</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((j) => (
              <tr key={j.id} className="hover:bg-slate-50/70">
                <td className="td font-medium text-slate-800">{j.name}</td>
                <td className="td text-slate-500">{j.queue}</td>
                <td className="td">
                  <Badge tone={(TONE[j.status] ?? "slate")}>{j.status}</Badge>
                </td>
                <td className="td text-slate-500">{j.attempts}</td>
                <td className="td text-slate-500">
                  {j.durationMs ? `${(j.durationMs / 1000).toFixed(1)}s` : "—"}
                </td>
                <td className="td whitespace-nowrap text-slate-500">
                  <div>{formatDateTime(j.queuedAt)}</div>
                  <div className="text-[11px] text-slate-400">{timeAgo(j.queuedAt)}</div>
                </td>
                <td className="td max-w-sm">
                  {j.error ? (
                    <span className="block truncate text-rose-600">{j.error}</span>
                  ) : j.result ? (
                    <span className="block truncate text-slate-500">{j.result}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="td">
                  <JobActions id={j.id} name={j.name} status={j.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
