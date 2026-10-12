import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { BarList, ChartPanel, Donut, type BarItem, type DonutSegment } from "@/components/charts";
import { formatDate, cx } from "@/lib/format";

const ACK_TONE: Record<string, DonutSegment["tone"]> = {
  ACKNOWLEDGED: "emerald",
  PENDING: "amber",
  OVERDUE: "rose",
  WAIVED: "slate",
};

export default async function HrPoliciesPage() {
  const { organisationId, org } = await hrContext();
  const nowTs = new Date().getTime();

  const [policies, ackGroups, overdueAcks, employeeCount] = await Promise.all([
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
      },
    }),
    prisma.policyAcknowledgement.groupBy({
      by: ["policyId", "status"],
      where: { organisationId },
      _count: { _all: true },
    }),
    prisma.policyAcknowledgement.count({ where: { organisationId, status: "OVERDUE" } }),
    prisma.employee.count({
      where: { organisationId, employmentStatus: { in: ["ACTIVE", "PROBATION", "LEAVE"] } },
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
      waived: acc.waived + r.waived,
    }),
    { total: 0, ackd: 0, pending: 0, overdue: 0, waived: 0 }
  );
  const overallRate = totals.total ? Math.round((totals.ackd / totals.total) * 100) : 0;
  const mandatory = rows.filter((r) => r.isMandatory).length;

  const statusSegments: DonutSegment[] = [
    { label: "Acknowledged", value: totals.ackd, tone: ACK_TONE.ACKNOWLEDGED },
    { label: "Pending", value: totals.pending, tone: ACK_TONE.PENDING },
    { label: "Overdue", value: totals.overdue, tone: ACK_TONE.OVERDUE },
    { label: "Waived", value: totals.waived, tone: ACK_TONE.WAIVED },
  ].filter((s) => s.value > 0);

  const coverageBars: BarItem[] = rows
    .map(
      (r): BarItem => ({
        label: r.title,
        value: r.ackd,
        tone: r.rate >= 80 ? "emerald" : r.rate >= 50 ? "amber" : "rose",
        hint: `${r.rate}% · ${r.pending} pending${r.overdue ? ` · ${r.overdue} overdue` : ""}`,
        href: `/hr/policies/acknowledgements?policy=${r.id}`,
      })
    )
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Company policies"
        subtitle={`${org.name} · versioned policy library with acknowledgement tracking`}
        action={{ label: "New policy", href: "/hr/policies/new" }}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Policies"
          value={rows.length}
          hint={`${mandatory} mandatory`}
          tone="sky"
        />
        <StatCard
          label="Acknowledged"
          value={`${overallRate}%`}
          hint={`${totals.ackd}/${totals.total} responses`}
          tone={overallRate >= 80 ? "emerald" : "amber"}
        />
        <StatCard
          label="Pending"
          value={totals.pending}
          hint="Not yet acknowledged"
          tone="amber"
        />
        <StatCard
          label="Overdue"
          value={totals.overdue}
          hint="Past their due date"
          tone={totals.overdue ? "rose" : "emerald"}
        />
      </div>

      {rows.length > 0 && (
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          <ChartPanel title="Acknowledgement coverage" subtitle="Across all policies">
            <Donut
              segments={statusSegments}
              size={140}
              thickness={16}
              centerValue={`${overallRate}%`}
              centerLabel="acknowledged"
            />
          </ChartPanel>
          <ChartPanel
            title="Least acknowledged policies"
            subtitle={`${employeeCount} active employees`}
            action={
              <Link
                href="/hr/policies/acknowledgements"
                className="text-[11px] text-sky-600 hover:underline"
              >
                Manage →
              </Link>
            }
          >
            <BarList items={coverageBars} valueFormat={(v) => `${v} ack`} />
          </ChartPanel>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          {overdueAcks} overdue acknowledgement{overdueAcks === 1 ? "" : "s"} across the organisation
        </span>
        <Link
          href="/hr/policies/acknowledgements"
          className="text-xs text-sky-600 hover:underline"
        >
          Policy acknowledgements →
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No policies yet"
          hint="Create your first policy, then issue it to collect acknowledgements."
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
              <th className="th text-right">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => {
              const reviewSoon =
                p.reviewDate && p.reviewDate.getTime() - nowTs < 1000 * 60 * 60 * 24 * 30;
              return (
                <tr key={p.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <Link
                      href={`/hr/policies/new?id=${p.id}`}
                      className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                    >
                      {p.title}
                    </Link>
                    <div className="max-w-md truncate text-xs text-slate-400">
                      {p.content.replace(/[#*>-]/g, "").slice(0, 120)}…
                    </div>
                  </td>
                  <td className="td text-slate-600">{p.category}</td>
                  <td className="td">
                    <Badge tone="blue">v{p.version}</Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-600">
                    {formatDate(p.effectiveDate)}
                  </td>
                  <td className="td whitespace-nowrap">
                    <span className={cx(reviewSoon ? "font-medium text-amber-600" : "text-slate-600")}>
                      {p.reviewDate ? formatDate(p.reviewDate) : "—"}
                    </span>
                    {reviewSoon && <div className="text-[11px] text-amber-500">Due soon</div>}
                  </td>
                  <td className="td">
                    {p.isMandatory ? (
                      <Badge tone="red">REQUIRED</Badge>
                    ) : (
                      <Badge tone="slate">Optional</Badge>
                    )}
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cx(
                            "h-full rounded-full",
                            p.rate >= 80
                              ? "bg-emerald-500"
                              : p.rate >= 50
                                ? "bg-amber-500"
                                : "bg-rose-500"
                          )}
                          style={{ width: `${p.rate}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">{p.rate}%</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {p.ackd}/{p.total} ack · {p.pending} pending
                      {p.overdue > 0 && (
                        <span className="text-rose-500"> · {p.overdue} overdue</span>
                      )}
                    </div>
                  </td>
                  <td className="td text-right">
                    <Link
                      href={`/hr/policies/new?id=${p.id}`}
                      className="btn-secondary !px-2 !py-1 text-[11px]"
                    >
                      Edit
                    </Link>
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
