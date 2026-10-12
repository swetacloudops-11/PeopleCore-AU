import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, TableWrap, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { parseEnum } from "@/lib/enums";
import { OrganisationStatus } from "@prisma/client";
import OrgRowActions from "@/components/OrgRowActions";

export const dynamic = "force-dynamic";

type Search = { q?: string; status?: string; industry?: string; page?: string };

export default async function OrganisationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const status = sp.status ?? "ALL";
  const industry = sp.industry ?? "ALL";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 12;

  const statusFilter = parseEnum(OrganisationStatus, status);
  const where = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(industry !== "ALL" ? { industry } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { abn: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, orgs, industries, counts] = await Promise.all([
    prisma.organisation.count({ where }),
    prisma.organisation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        subscriptions: { include: { plan: true }, take: 1, orderBy: { createdAt: "desc" } },
        integrations: { include: { integration: { select: { name: true } } } },
      },
    }),
    prisma.organisation.findMany({
      where: { industry: { not: null } },
      distinct: ["industry"],
      select: { industry: true },
      orderBy: { industry: "asc" },
    }),
    prisma.organisation.groupBy({ by: ["status"], _count: true }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const statusTone = (s: string) =>
    s === "ACTIVE" ? "green" : s === "DISABLED" ? "red" : "amber";

  const buildQuery = (over: Partial<Record<string, string | number>>) => {
    const params = new URLSearchParams();
    const merged = { q, status, industry, page, ...over };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== "" && v !== undefined && v !== null) params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div>
      <PageHeader
        title="All Organisations"
        subtitle={`${total} organisation${total === 1 ? "" : "s"} matching your filters`}
        action={{ label: "Create Organisation", href: "/organisations/create" }}
      />

      {/* Status chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["ALL", "All", total],
          ["ACTIVE", "Active", countMap.ACTIVE ?? 0],
          ["DISABLED", "Disabled", countMap.DISABLED ?? 0],
          ["PENDING", "Pending", countMap.PENDING ?? 0],
        ].map(([key, label, n]) => (
          <Link
            key={key as string}
            href={buildQuery({ status: key as string, page: 1 })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              status === key
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {label} · {n as number}
          </Link>
        ))}
      </div>

      {/* Filters */}
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="q">Search</label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Name, slug, email or ABN…"
          />
        </div>
        <div className="w-48">
          <label className="label" htmlFor="industry">Industry</label>
          <select id="industry" name="industry" defaultValue={industry} className="input">
            <option value="ALL">All industries</option>
            {industries.map(
              (i) =>
                i.industry && (
                  <option key={i.industry} value={i.industry}>
                    {i.industry}
                  </option>
                )
            )}
          </select>
        </div>
        <input type="hidden" name="status" value={status} />
        <button type="submit" className="btn-secondary">Filter</button>
        {(q || industry !== "ALL") && (
          <Link href={`/organisations?status=${status}`} className="btn-secondary">
            Reset
          </Link>
        )}
      </form>

      {orgs.length === 0 ? (
        <EmptyState
          title="No organisations match these filters"
          hint="Try clearing the search or choosing a different status."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Organisation</th>
              <th className="th">Industry</th>
              <th className="th">Location</th>
              <th className="th">Plan</th>
              <th className="th">Integrations</th>
              <th className="th">Status</th>
              <th className="th">Created</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgs.map((o) => {
              const plan = o.subscriptions[0]?.plan;
              const connected = o.integrations.filter(
                (m) => m.status === "CONNECTED"
              ).length;
              return (
                <tr key={o.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">{o.name}</div>
                    <div className="text-xs text-slate-400">
                      {o.email ?? o.slug} {o.abn ? `· ABN ${o.abn}` : ""}
                    </div>
                  </td>
                  <td className="td">{o.industry ?? "—"}</td>
                  <td className="td">
                    {[o.city, o.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="td">
                    {plan ? (
                      <Badge tone="blue">{plan.name}</Badge>
                    ) : (
                      <span className="text-slate-400">No plan</span>
                    )}
                  </td>
                  <td className="td text-slate-500">
                    {connected}/{o.integrations.length} connected
                  </td>
                  <td className="td">
                    <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                  </td>
                  <td className="td text-slate-500">{formatDate(o.createdAt)}</td>
                  <td className="td">
                    <OrgRowActions id={o.id} name={o.name} status={o.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {totalPages}
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
