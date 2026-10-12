import Link from "next/link";
import { AcknowledgementStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { ChartPanel, Donut, BarList, type DonutSegment } from "@/components/charts";
import { formatDate, cx } from "@/lib/format";
import AckActions from "./AckActions";

export const dynamic = "force-dynamic";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const PAGE_SIZE = 25;

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const TONES: Record<string, string> = {
  PENDING: "amber",
  ACKNOWLEDGED: "green",
  OVERDUE: "red",
  WAIVED: "slate",
};

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default async function AcknowledgementsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const { organisationId } = await orgContext();

  const status = parseEnum(AcknowledgementStatus, one(sp.status));
  const policyId = strParam(one(sp.policy));
  const page = intParam(one(sp.page), 1, 500);
  const today = D(0);

  const where = {
    organisationId,
    ...(status ? { status } : {}),
    ...(policyId ? { policyId } : {}),
  };

  const [acks, ackCount, statusGroups, policies, pending, overdue, ackd, byPolicy] =
    await Promise.all([
      prisma.policyAcknowledgement.findMany({
        where,
        orderBy: [
          { status: "asc" },
          { dueDate: { sort: "asc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
          policy: { select: { title: true, category: true, isMandatory: true } },
        },
      }),
      prisma.policyAcknowledgement.count({ where }),
      prisma.policyAcknowledgement.groupBy({
        by: ["status"],
        where: { organisationId },
        _count: { _all: true },
      }),
      prisma.policy.findMany({
        where: { organisationId },
        orderBy: { title: "asc" },
        select: { id: true, title: true },
      }),
      prisma.policyAcknowledgement.count({ where: { organisationId, status: "PENDING" } }),
      prisma.policyAcknowledgement.count({ where: { organisationId, status: "OVERDUE" } }),
      prisma.policyAcknowledgement.count({
        where: { organisationId, status: "ACKNOWLEDGED" },
      }),
      prisma.policyAcknowledgement.groupBy({
        by: ["policyId", "status"],
        where: { organisationId },
        _count: { _all: true },
      }),
    ]);

  const totals = statusGroups.reduce((n, g) => n + g._count._all, 0);
  const ackRate = totals ? Math.round((ackd / totals) * 100) : 0;
  const totalPages = Math.max(1, Math.ceil(ackCount / PAGE_SIZE));
  const filters = { status: status || undefined, policy: policyId || undefined };

  // Per-policy acknowledgement rate, worst first.
  const policyRates = (() => {
    const map = new Map<string, { ack: number; total: number }>();
    for (const row of byPolicy) {
      const cur = map.get(row.policyId) ?? { ack: 0, total: 0 };
      cur.total += row._count._all;
      if (row.status === "ACKNOWLEDGED") cur.ack += row._count._all;
      map.set(row.policyId, cur);
    }
    return policies
      .map((p) => {
        const v = map.get(p.id);
        if (!v || v.total === 0) return null;
        return {
          label: p.title,
          value: Math.round((v.ack / v.total) * 100),
          hint: `${v.ack}/${v.total} signed`,
        };
      })
      .filter((x): x is { label: string; value: number; hint: string } => x !== null)
      .sort((a, b) => a.value - b.value)
      .slice(0, 8);
  })();

  return (
    <div>
      <PageHeader
        title="Policy Acknowledgements"
        subtitle="Who has signed off on which policy — and who is overdue."
        action={{ label: "Company policies", href: "/org/policies" }}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Acknowledged"
          value={`${ackRate}%`}
          hint={`${ackd}/${totals} responses`}
          tone={ackRate >= 80 ? "emerald" : "amber"}
        />
        <StatCard label="Pending" value={pending} hint="Awaiting response" tone="sky" />
        <StatCard label="Overdue" value={overdue} hint="Past due date" tone={overdue ? "rose" : "emerald"} />
        <StatCard
          label="Waived"
          value={statusGroups.find((g) => g.status === "WAIVED")?._count._all ?? 0}
          hint="Excused by admin"
          tone="indigo"
        />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Acknowledgement status" subtitle="Every policy response">
          <Donut
            segments={(
              [
                { label: "Acknowledged", value: ackd, tone: "emerald" },
                { label: "Pending", value: pending, tone: "sky" },
                { label: "Overdue", value: overdue, tone: "rose" },
                {
                  label: "Waived",
                  value: statusGroups.find((g) => g.status === "WAIVED")?._count._all ?? 0,
                  tone: "slate",
                },
              ] as DonutSegment[]
            ).filter((s) => s.value > 0)}
            size={134}
            thickness={16}
            centerValue={`${ackRate}%`}
            centerLabel="acknowledged"
          />
        </ChartPanel>

        <ChartPanel
          title="Compliance by policy"
          subtitle="Acknowledgement rate — lowest first"
          action={
            <Link href="/org/policies" className="text-[11px] text-indigo-600 hover:underline">
              Policies →
            </Link>
          }
        >
          <BarList
            items={policyRates.map((r) => ({
              label: r.label,
              value: r.value,
              hint: r.hint,
              tone: r.value >= 80 ? "emerald" : r.value >= 50 ? "amber" : "rose",
            }))}
            valueFormat={(v) => `${v}%`}
            showPercents={false}
          />
        </ChartPanel>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "All", value: "" },
            { label: "Pending", value: "PENDING" },
            { label: "Acknowledged", value: "ACKNOWLEDGED" },
            { label: "Overdue", value: "OVERDUE" },
            { label: "Waived", value: "WAIVED" },
          ].map((s) => (
            <Link
              key={s.label}
              href={qs({ ...filters, status: s.value, page: 1 })}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                (status ?? "") === s.value
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>

        <form className="flex flex-wrap items-center gap-2" method="get">
          <input type="hidden" name="status" value={status ?? ""} />
          <select name="policy" key={`p-${policyId}`} defaultValue={policyId} className="input !w-64">
            <option value="">All policies</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>
      </div>

      {acks.length === 0 ? (
        <EmptyState
          title="No acknowledgements match these filters"
          hint="Publish a policy to generate acknowledgement records."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Employee</th>
              <th className="th">Policy</th>
              <th className="th">Status</th>
              <th className="th">Acknowledged</th>
              <th className="th">Due date</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {acks.map((a) => {
              const pastDue =
                a.dueDate &&
                a.dueDate.getTime() < today.getTime() &&
                a.status === "PENDING";
              return (
                <tr key={a.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">
                      {a.employee.firstName} {a.employee.lastName}
                    </div>
                    <div className="text-xs text-slate-400">{a.employee.employeeNumber}</div>
                  </td>
                  <td className="td">
                    <div className="text-slate-700">{a.policy.title}</div>
                    <div className="text-xs text-slate-400">
                      {a.policy.category}
                      {a.policy.isMandatory ? " · required" : ""}
                    </div>
                  </td>
                  <td className="td">
                    <Badge tone={TONES[a.status] ?? "slate"}>{pretty(a.status)}</Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {a.acknowledgedAt ? (
                      <>
                        <div>{formatDate(a.acknowledgedAt)}</div>
                        {a.ipAddress && (
                          <div className="text-[11px] text-slate-400">{a.ipAddress}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="td whitespace-nowrap">
                    <span className={cx(pastDue ? "font-medium text-rose-600" : "text-slate-600")}>
                      {a.dueDate ? formatDate(a.dueDate) : "—"}
                    </span>
                    {pastDue && <div className="text-[11px] text-rose-500">Past due</div>}
                  </td>
                  <td className="td text-right">
                    <AckActions policyId={a.policyId} acknowledgementId={a.id} status={a.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      {ackCount > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages} · {ackCount} acknowledgements
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ ...filters, page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={qs({ ...filters, page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
