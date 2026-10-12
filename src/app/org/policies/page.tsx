import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, cx } from "@/lib/format";
import { NewPolicyButton, PolicyRowActions } from "./PolicyActions";

export const dynamic = "force-dynamic";

const isoDate = (d: Date | null) => {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default async function PoliciesPage() {
  const { organisationId } = await orgContext();

  const [policies, ackGroups, overdueAcks] = await Promise.all([
    prisma.policy.findMany({
      where: { organisationId },
      orderBy: [{ isMandatory: "desc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        category: true,
        content: true,
        version: true,
        effectiveDate: true,
        reviewDate: true,
        isMandatory: true,
        createdAt: true,
        _count: { select: { acknowledgements: true } },
      },
    }),
    prisma.policyAcknowledgement.groupBy({
      by: ["policyId", "status"],
      where: { organisationId },
      _count: { _all: true },
    }),
    prisma.policyAcknowledgement.count({
      where: { organisationId, status: "OVERDUE" },
    }),
  ]);

  const countsByPolicy = new Map<string, Record<string, number>>();
  for (const g of ackGroups) {
    const entry = countsByPolicy.get(g.policyId) ?? {};
    entry[g.status] = g._count._all;
    countsByPolicy.set(g.policyId, entry);
  }

  const rows = policies.map((p) => {
    const counts = countsByPolicy.get(p.id) ?? {};
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const ackd = counts.ACKNOWLEDGED ?? 0;
    const pending = counts.PENDING ?? 0;
    const overdue = counts.OVERDUE ?? 0;
    const waived = counts.WAIVED ?? 0;
    const rate = total ? Math.round((ackd / total) * 100) : 0;
    return { ...p, total, ackd, pending, overdue, waived, rate };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      ackd: acc.ackd + r.ackd,
      pending: acc.pending + r.pending,
      overdue: acc.overdue + r.overdue,
    }),
    { total: 0, ackd: 0, pending: 0, overdue: 0 }
  );
  const overallRate = totals.total ? Math.round((totals.ackd / totals.total) * 100) : 0;
  const mandatory = rows.filter((r) => r.isMandatory).length;
  const nowTs = new Date().getTime();

  return (
    <div>
      <PageHeader
        title="Company Policies"
        subtitle="Versioned policy library with acknowledgement tracking."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Policies" value={rows.length} hint={`${mandatory} mandatory`} tone="indigo" />
        <StatCard
          label="Acknowledged"
          value={`${overallRate}%`}
          hint={`${totals.ackd}/${totals.total} responses`}
          tone={overallRate >= 80 ? "emerald" : "amber"}
        />
        <StatCard label="Pending" value={totals.pending} hint="Not yet acknowledged" tone="sky" />
        <StatCard label="Overdue" value={totals.overdue} hint="Past due date" tone={totals.overdue ? "rose" : "emerald"} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          {overdueAcks} overdue acknowledgements across the organisation
        </span>
        <NewPolicyButton />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No policies yet"
          hint="Create your first policy, then publish it to collect acknowledgements."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Policy</th>
              <th className="th">Category</th>
              <th className="th">Version</th>
              <th className="th">Effective</th>
              <th className="th">Review date</th>
              <th className="th">Mandatory</th>
              <th className="th">Acknowledgements</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => {
              const reviewSoon =
                p.reviewDate && p.reviewDate.getTime() - nowTs < 1000 * 60 * 60 * 24 * 30;
              return (
                <tr key={p.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">{p.title}</div>
                    <div className="max-w-md truncate text-xs text-slate-400">
                      {p.content.replace(/[#*>-]/g, "").slice(0, 120)}…
                    </div>
                  </td>
                  <td className="td text-slate-600">{p.category}</td>
                  <td className="td">
                    <Badge tone="blue">v{p.version}</Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-600">{formatDate(p.effectiveDate)}</td>
                  <td className="td whitespace-nowrap">
                    <span className={cx(reviewSoon ? "font-medium text-amber-600" : "text-slate-600")}>
                      {p.reviewDate ? formatDate(p.reviewDate) : "—"}
                    </span>
                    {reviewSoon && <div className="text-[11px] text-amber-500">Due soon</div>}
                  </td>
                  <td className="td">
                    {p.isMandatory ? <Badge tone="red">REQUIRED</Badge> : <Badge tone="slate">Optional</Badge>}
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cx(
                            "h-full rounded-full",
                            p.rate >= 80 ? "bg-emerald-500" : p.rate >= 50 ? "bg-amber-500" : "bg-rose-500"
                          )}
                          style={{ width: `${p.rate}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">{p.rate}%</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {p.ackd}/{p.total} ack · {p.pending} pending
                      {p.overdue > 0 && <span className="text-rose-500"> · {p.overdue} overdue</span>}
                    </div>
                  </td>
                  <td className="td text-right">
                    <PolicyRowActions
                      id={p.id}
                      ackCount={p.total}
                      initial={{
                        title: p.title,
                        category: p.category,
                        content: p.content,
                        version: p.version,
                        effectiveDate: isoDate(p.effectiveDate),
                        reviewDate: isoDate(p.reviewDate),
                        isMandatory: p.isMandatory,
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
