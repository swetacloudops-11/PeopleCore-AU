import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, TableWrap, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

const SEVERITY_TONE: Record<string, string> = {
  INFO: "blue",
  WARNING: "amber",
  ERROR: "red",
};

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; category?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const action = sp.action ?? "ALL";
  const category = sp.category ?? "ALL";
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 25;

  const where = {
    ...(action !== "ALL" ? { action } : {}),
    ...(category !== "ALL" ? { category } : {}),
    ...(q
      ? {
          OR: [
            { description: { contains: q, mode: "insensitive" as const } },
            { action: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, logs, categories, actions] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { name: true, email: true } },
        organisation: { select: { name: true } },
      },
    }),
    prisma.auditLog.findMany({
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
      take: 60,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const buildQuery = (over: Record<string, string | number>) => {
    const params = new URLSearchParams({ action, category, q, page: String(page) });
    for (const [k, v] of Object.entries(over)) params.set(k, String(v));
    return `?${params.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle={`${total.toLocaleString()} recorded event${total === 1 ? "" : "s"} · immutable activity trail`}
      />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="Description or action…" />
        </div>
        <div className="w-52">
          <label className="label" htmlFor="category">Category</label>
          <select id="category" name="category" defaultValue={category} className="input">
            <option value="ALL">All categories</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>{c.category}</option>
            ))}
          </select>
        </div>
        <div className="w-56">
          <label className="label" htmlFor="action">Action</label>
          <select id="action" name="action" defaultValue={action} className="input">
            <option value="ALL">All actions</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>{a.action}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
        {(q || category !== "ALL" || action !== "ALL") && (
          <Link href="/audit-logs" className="btn-secondary">Reset</Link>
        )}
      </form>

      {logs.length === 0 ? (
        <EmptyState title="No audit records match these filters" />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Timestamp</th>
              <th className="th">Action</th>
              <th className="th">Category</th>
              <th className="th">Description</th>
              <th className="th">Actor</th>
              <th className="th">IP</th>
              <th className="th">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => (
              <tr key={l.id} className="align-top hover:bg-slate-50/70">
                <td className="td whitespace-nowrap text-slate-500">
                  {formatDateTime(l.createdAt)}
                </td>
                <td className="td">
                  <code className="text-xs font-medium text-slate-700">{l.action}</code>
                </td>
                <td className="td">
                  <Badge tone="slate">{l.category}</Badge>
                </td>
                <td className="td max-w-md">
                  <div className="text-slate-700">{l.description ?? "—"}</div>
                  {l.organisation && (
                    <div className="text-[11px] text-slate-400">
                      org: {l.organisation.name}
                    </div>
                  )}
                </td>
                <td className="td">
                  {l.user ? (
                    <>
                      <div className="text-slate-700">{l.user.name}</div>
                      <div className="text-[11px] text-slate-400">{l.user.email}</div>
                    </>
                  ) : (
                    <span className="text-slate-400">system</span>
                  )}
                </td>
                <td className="td font-mono text-xs text-slate-500">{l.ipAddress ?? "—"}</td>
                <td className="td">
                  <Badge tone={(SEVERITY_TONE[l.severity] ?? "slate")}>
                    {l.severity}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {totalPages.toLocaleString()}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={buildQuery({ page: page - 1 })} className="btn-secondary">
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={buildQuery({ page: page + 1 })} className="btn-secondary">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
