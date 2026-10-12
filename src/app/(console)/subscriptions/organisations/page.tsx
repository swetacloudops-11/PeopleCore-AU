import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, TableWrap, EmptyState } from "@/components/ui";
import { formatMoney, formatDate } from "@/lib/format";
import { parseEnum } from "@/lib/enums";
import { SubscriptionStatus } from "@prisma/client";
import SubscriptionActions from "@/components/SubscriptionActions";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "green",
  TRIALING: "blue",
  PAST_DUE: "amber",
  CANCELLED: "red",
  EXPIRED: "slate",
};

export default async function OrgSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "ALL";
  const q = sp.q?.trim() ?? "";

  const statusFilter = parseEnum(SubscriptionStatus, status);
  const subs = await prisma.organisationSubscription.findMany({
    where: {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(q ? { organisation: { name: { contains: q, mode: "insensitive" } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      organisation: { select: { name: true, slug: true, status: true } },
      plan: true,
    },
  });

  const counts = await prisma.organisationSubscription.groupBy({
    by: ["status"],
    _count: true,
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);

  const totals = await prisma.organisationSubscription.aggregate({
    _sum: { amount: true },
    where: { status: { in: ["ACTIVE", "TRIALING"] } },
  });

  const allPlans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      priceMonthly: true,
      priceAnnual: true,
    },
  });

  const buildQuery = (over: Record<string, string>) => {
    const params = new URLSearchParams({ status, q, ...over });
    return `?${params.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Organisation Subscriptions"
        subtitle={`${subs.length} subscription${subs.length === 1 ? "" : "s"} · ${formatMoney(
          Number(totals._sum.amount ?? 0)
        )} contracted value`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {["ALL", "ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED", "EXPIRED"].map((s) => (
          <a
            key={s}
            href={buildQuery({ status: s, q: "" })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              status === s
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "ALL" ? "All" : s.replace("_", " ")} ·{" "}
            {s === "ALL" ? totalAll : countMap[s] ?? 0}
          </a>
        ))}
      </div>

      <form method="GET" className="mb-4 flex gap-3">
        <input
          name="q"
          defaultValue={q}
          className="input max-w-sm"
          placeholder="Search by organisation name…"
        />
        <input type="hidden" name="status" value={status} />
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {subs.length === 0 ? (
        <EmptyState title="No subscriptions match these filters" />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Organisation</th>
              <th className="th">Plan</th>
              <th className="th">Cycle</th>
              <th className="th">Seats</th>
              <th className="th">Amount</th>
              <th className="th">Period end</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subs.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/70">
                <td className="td">
                  <div className="font-medium text-slate-800">{s.organisation.name}</div>
                  <div className="text-xs text-slate-400">{s.organisation.slug}</div>
                </td>
                <td className="td">
                  <Badge tone="blue">{s.plan.name}</Badge>
                </td>
                <td className="td">{s.cycle}</td>
                <td className="td">{s.seats}</td>
                <td className="td font-medium">{formatMoney(s.amount, s.currency)}</td>
                <td className="td text-slate-500">{formatDate(s.currentPeriodEnd)}</td>
                <td className="td">
                  <Badge tone={STATUS_TONE[s.status] ?? "slate"}>{s.status}</Badge>
                </td>
                <td className="td">
                  <div className="flex justify-end">
                    <SubscriptionActions
                      sub={{
                        id: s.id,
                        organisationName: s.organisation.name,
                        planId: s.planId,
                        status: s.status,
                        cycle: s.cycle,
                        seats: s.seats,
                      }}
                      plans={allPlans}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
