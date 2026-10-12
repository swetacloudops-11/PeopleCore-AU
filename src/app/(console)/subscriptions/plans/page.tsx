import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, TableWrap, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import PlanManager from "@/components/PlanManager";
import PlanRowActions from "@/components/PlanRowActions";
import PlanEditListener from "@/components/PlanEditListener";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { subscriptions: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Plans"
        subtitle={`${plans.length} subscription plan${plans.length === 1 ? "" : "s"} available on the platform`}
      />

      <div className="mb-5 flex justify-end">
        <PlanManager trigger="+ Create plan" />
      </div>

      {plans.length === 0 ? (
        <EmptyState title="No plans configured" hint="Create a plan to start selling subscriptions." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => {
            const active = p._count.subscriptions;
            return (
              <div
                key={p.id}
                className={`card flex flex-col p-5 ${
                  p.isActive ? "" : "opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">{p.name}</h3>
                      <Badge tone={p.isActive ? "green" : "slate"}>
                        {p.isActive ? "ACTIVE" : "RETIRED"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{p.code}</p>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-500">{p.description}</p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-slate-900">
                    {formatMoney(p.priceMonthly)}
                  </span>
                  <span className="text-sm text-slate-400">/mo</span>
                </div>
                <div className="text-xs text-slate-400">
                  {formatMoney(p.priceAnnual)} per year · {p.billingCycle}
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">Employees</dt>
                    <dd className="text-sm font-semibold text-slate-700">
                      {p.maxEmployees || "∞"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">Orgs</dt>
                    <dd className="text-sm font-semibold text-slate-700">
                      {p.maxOrganisations || "∞"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">Trial</dt>
                    <dd className="text-sm font-semibold text-slate-700">{p.trialDays}d</dd>
                  </div>
                </dl>

                <ul className="mt-4 flex-1 space-y-1.5 border-t border-slate-100 pt-4">
                  {p.features.length === 0 && (
                    <li className="text-xs text-slate-400">No features listed</li>
                  )}
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="text-emerald-500">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500">
                    <strong className="text-slate-700">{active}</strong> subscription
                    {active === 1 ? "" : "s"}
                  </span>
                  <PlanRowActions
                    id={p.id}
                    name={p.name}
                    isActive={p.isActive}
                    subscriberCount={active}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Plan comparison</h2>
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Plan</th>
              <th className="th">Code</th>
              <th className="th">Monthly</th>
              <th className="th">Annual</th>
              <th className="th">Max employees</th>
              <th className="th">Trial days</th>
              <th className="th">Subscribers</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plans.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/70">
                <td className="td font-medium text-slate-800">{p.name}</td>
                <td className="td text-slate-500">{p.code}</td>
                <td className="td">{formatMoney(p.priceMonthly)}</td>
                <td className="td">{formatMoney(p.priceAnnual)}</td>
                <td className="td">{p.maxEmployees || "Unlimited"}</td>
                <td className="td">{p.trialDays}</td>
                <td className="td">{p._count.subscriptions}</td>
                <td className="td">
                  <Badge tone={p.isActive ? "green" : "slate"}>
                    {p.isActive ? "ACTIVE" : "RETIRED"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </div>

      <PlanEditListener
        plans={plans.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          priceMonthly: p.priceMonthly,
          priceAnnual: p.priceAnnual,
          maxEmployees: p.maxEmployees,
          maxOrganisations: p.maxOrganisations,
          trialDays: p.trialDays,
          features: p.features,
          isActive: p.isActive,
          sortOrder: p.sortOrder,
        }))}
      />
    </div>
  );
}
