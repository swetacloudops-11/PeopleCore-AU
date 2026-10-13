import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { BarList, ChartPanel, type BarItem } from "@/components/charts";
import CategoryActions, { NewCategoryButton } from "../CategoryActions";

export const dynamic = "force-dynamic";

export default async function OvertimePage() {
  const { organisationId, org } = await payrollContext();

  const categories = await prisma.payCategory.findMany({
    where: { organisationId, type: "OVERTIME" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const active = categories.filter((c) => c.isActive).length;
  const multipliers = categories.filter((c) => c.unit === "MULTIPLIER").length;
  const avgMultiplier =
    multipliers > 0
      ? categories.filter((c) => c.unit === "MULTIPLIER").reduce((a, c) => a + Number(c.rate), 0) /
        multipliers
      : 0;

  const items = categories.map(
    (c): BarItem => ({
      label: c.name,
      value: Number(c.rate),
      hint: `${c.code} · ${c.unit.replace(/_/g, " ")}`,
    })
  );

  return (
    <div>
      <PageHeader
        title="Overtime"
        subtitle={`${org.name} · overtime categories and the multipliers applied to extra hours`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Overtime categories" value={categories.length} hint="Type: OVERTIME" tone="amber" />
        <StatCard label="Active" value={active} hint={`${categories.length - active} inactive`} tone="emerald" />
        <StatCard label="Multiplier rates" value={multipliers} hint="Unit: MULTIPLIER" tone="sky" />
        <StatCard
          label="Average multiplier"
          value={avgMultiplier > 0 ? `${avgMultiplier.toFixed(2)}×` : "—"}
          hint="Across multiplier rates"
          tone="indigo"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ChartPanel
          title="Overtime rates"
          subtitle="Rate value per overtime category"
          className="lg:col-span-1"
        >
          <BarList items={items} valueFormat={(v) => `${v.toFixed(2)}×`} showPercents={false} />
        </ChartPanel>

        <div className="lg:col-span-2">
          <div className="mb-3 flex justify-end">
            <NewCategoryButton defaultType="OVERTIME" label="Add overtime" />
          </div>

          {categories.length === 0 ? (
            <EmptyState
              title="No overtime categories"
              hint="Add an overtime category to define the multiplier for extra hours."
            />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Code</th>
                  <th className="th">Name</th>
                  <th className="th">Rate</th>
                  <th className="th">Unit</th>
                  <th className="th">Taxable</th>
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
                    <td className="td tabular-nums text-slate-700">{Number(c.rate).toFixed(2)}</td>
                    <td className="td text-slate-500">{c.unit.replace(/_/g, " ")}</td>
                    <td className="td">
                      <Badge tone={c.isTaxable ? "green" : "slate"}>{c.isTaxable ? "Yes" : "No"}</Badge>
                    </td>
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
