import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { BarList, ChartPanel, type BarItem } from "@/components/charts";
import CategoryActions, { NewCategoryButton } from "../CategoryActions";

export const dynamic = "force-dynamic";

/** Match categories whose name or code looks like a penalty / loading. */
const KEYWORDS = ["penalty", "loading", "sunday", "saturday", "holiday"];

const TYPE_BADGE: Record<string, string> = {
  ORDINARY: "blue",
  OVERTIME: "purple",
  ALLOWANCE: "amber",
  BONUS: "green",
  SUPER: "green",
  TAX: "red",
  DEDUCTION: "slate",
  REIMBURSEMENT: "blue",
};

export default async function PenaltyRatesPage() {
  const { organisationId, org } = await payrollContext();

  const categories = await prisma.payCategory.findMany({
    where: {
      organisationId,
      OR: KEYWORDS.flatMap((k) => [
        { name: { contains: k, mode: "insensitive" as const } },
        { code: { contains: k, mode: "insensitive" as const } },
      ]),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const active = categories.filter((c) => c.isActive).length;
  const multiplierRates = categories.filter((c) => c.unit === "MULTIPLIER");
  const maxMultiplier = multiplierRates.reduce((a, c) => Math.max(a, Number(c.rate)), 0);

  const items = multiplierRates.map(
    (c): BarItem => ({
      label: c.name,
      value: Number(c.rate),
      hint: c.code,
    })
  );

  return (
    <div>
      <PageHeader
        title="Penalty Rates"
        subtitle={`${org.name} · weekend, evening and public-holiday loadings`}
      />

      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
        <p className="font-semibold">About penalty rates</p>
        <p className="mt-1">
          The pay-category type enum has no dedicated PENALTY member, so penalty loadings are
          stored as <code className="rounded bg-amber-100 px-1">ALLOWANCE</code> categories with a
          multiplier rate. This view collects every category whose name or code mentions a
          penalty, loading, weekend or public holiday.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Penalty loadings" value={categories.length} hint="Name or code matched" tone="amber" />
        <StatCard label="Active" value={active} hint={`${categories.length - active} inactive`} tone="emerald" />
        <StatCard label="Multiplier rates" value={multiplierRates.length} hint="Unit: MULTIPLIER" tone="sky" />
        <StatCard
          label="Highest multiplier"
          value={maxMultiplier > 0 ? `${maxMultiplier.toFixed(2)}×` : "—"}
          hint="Peak loading"
          tone="rose"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ChartPanel title="Loading multipliers" subtitle="Rate applied per penalty category">
          <BarList items={items} valueFormat={(v) => `${v.toFixed(2)}×`} showPercents={false} />
        </ChartPanel>

        <div className="lg:col-span-2">
          <div className="mb-3 flex justify-end">
            <NewCategoryButton defaultType="ALLOWANCE" label="Add penalty rate" />
          </div>

          {categories.length === 0 ? (
            <EmptyState
              title="No penalty rates found"
              hint="Add a loading category with 'Penalty', 'Loading' or a weekend day in its name."
            />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Code</th>
                  <th className="th">Name</th>
                  <th className="th">Type</th>
                  <th className="th">Loading</th>
                  <th className="th">Unit</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                        {c.code}
                      </code>
                    </td>
                    <td className="td font-medium text-slate-800">{c.name}</td>
                    <td className="td">
                      <Badge tone={TYPE_BADGE[c.type] ?? "slate"}>
                        {c.type.charAt(0) + c.type.slice(1).toLowerCase()}
                      </Badge>
                    </td>
                    <td className="td tabular-nums text-slate-700">
                      {c.unit === "MULTIPLIER"
                        ? `${Number(c.rate).toFixed(2)}×`
                        : Number(c.rate).toFixed(2)}
                    </td>
                    <td className="td text-slate-500">{c.unit.replace(/_/g, " ")}</td>
                    <td className="td">
                      <Badge tone={c.isActive ? "green" : "red"}>
                        {c.isActive ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </td>
                    <td className="td">
                      <CategoryActions
                        category={{
                          id: c.id,
                          name: c.name,
                          code: c.code,
                          type: c.type,
                          rate: Number(c.rate),
                          unit: c.unit,
                          isTaxable: c.isTaxable,
                          isSuperable: c.isSuperable,
                          appliesTo: c.appliesTo,
                          sortOrder: c.sortOrder,
                          isActive: c.isActive,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      </div>
    </div>
  );
}
