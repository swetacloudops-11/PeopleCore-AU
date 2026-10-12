import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, TableWrap, EmptyState } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { parseEnum } from "@/lib/enums";
import { ErrorSeverity } from "@prisma/client";
import ResolveError from "./ResolveError";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  INFO: "blue",
  WARNING: "amber",
  ERROR: "red",
  CRITICAL: "red",
};

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; state?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const severity = sp.severity ?? "ALL";
  const state = sp.state ?? "OPEN";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 20;

  const severityFilter = parseEnum(ErrorSeverity, severity);
  const where = {
    ...(severityFilter ? { severity: severityFilter } : {}),
    ...(state === "OPEN" ? { resolved: false } : state === "RESOLVED" ? { resolved: true } : {}),
  };

  const [total, errors, counts] = await Promise.all([
    prisma.errorLog.count({ where }),
    prisma.errorLog.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.errorLog.groupBy({ by: ["severity"], _count: true, where: { resolved: false } }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.severity, c._count]));
  const openTotal = Object.values(countMap).reduce((a, b) => a + b, 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const buildQuery = (over: Record<string, string>) =>
    `?${new URLSearchParams({ severity, state, ...over }).toString()}`;

  return (
    <div>
      <PageHeader
        title="Errors"
        subtitle={`${openTotal} unresolved error${openTotal === 1 ? "" : "s"} across the platform`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {["ALL", "CRITICAL", "ERROR", "WARNING", "INFO"].map((s) => (
          <a
            key={s}
            href={buildQuery({ severity: s })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              severity === s
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s} {s !== "ALL" && countMap[s] !== undefined ? `· ${countMap[s]}` : ""}
          </a>
        ))}
        <span className="mx-1 h-4 w-px bg-slate-300" />
        {["OPEN", "RESOLVED", "ALL_STATES"].map((st) => (
          <a
            key={st}
            href={buildQuery({ state: st === "ALL_STATES" ? "ALL" : st })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              state === (st === "ALL_STATES" ? "ALL" : st)
                ? "bg-slate-800 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {st === "ALL_STATES" ? "Any state" : st}
          </a>
        ))}
      </div>

      {errors.length === 0 ? (
        <EmptyState
          title={state === "OPEN" ? "No unresolved errors" : "No errors match these filters"}
          hint="Errors captured by the platform will appear here for triage."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Occurred</th>
              <th className="th">Severity</th>
              <th className="th">Source</th>
              <th className="th">Message</th>
              <th className="th">Path</th>
              <th className="th">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {errors.map((e) => (
              <tr key={e.id} className="align-top hover:bg-slate-50/70">
                <td className="td whitespace-nowrap text-slate-500">{timeAgo(e.occurredAt)}</td>
                <td className="td">
                  <Badge tone={(TONE[e.severity] ?? "slate")}>{e.severity}</Badge>
                </td>
                <td className="td text-slate-600">{e.source}</td>
                <td className="td max-w-md">
                  <div className="text-slate-800">{e.message}</div>
                  {e.stackTrace && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] text-slate-400">
                        Stack trace
                      </summary>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500">
                        {e.stackTrace}
                      </pre>
                    </details>
                  )}
                </td>
                <td className="td text-xs text-slate-500">{e.path ?? "—"}</td>
                <td className="td">
                  {e.resolved ? (
                    <Badge tone="green">RESOLVED</Badge>
                  ) : (
                    <ResolveError id={e.id} />
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
            {page > 1 && <a href={buildQuery({ page: String(page - 1) })} className="btn-secondary">← Previous</a>}
            {page < totalPages && <a href={buildQuery({ page: String(page + 1) })} className="btn-secondary">Next →</a>}
          </div>
        </div>
      )}
    </div>
  );
}
