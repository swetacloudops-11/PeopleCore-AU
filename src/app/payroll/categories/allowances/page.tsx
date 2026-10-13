import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import CategoryActions, { NewCategoryButton } from "../CategoryActions";

export const dynamic = "force-dynamic";

const rateLabel = (rate: number, unit: string): string => {
  const n = rate.toFixed(2);
  switch (unit) {
    case "PERCENT":
      return `${n}%`;
    case "MULTIPLIER":
      return `${n}×`;
    case "HOURS":
      return `${n}/h`;
    case "PER_KM":
      return `${n}/km`;
    case "PER_DAY":
      return `${n}/day`;
    default:
      return formatMoney(rate);
  }
};

export default async function AllowancesPage() {
  const { organisationId, org } = await payrollContext();

  const categories = await prisma.payCategory.findMany({
    where: { organisationId, type: "ALLOWANCE" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const active = categories.filter((c) => c.isActive).length;
  const taxable = categories.filter((c) => c.isTaxable).length;
  const superable = categories.filter((c) => c.isSuperable).length;

  return (
    <div>
      <PageHeader
        title="Allowances"
        subtitle={`${org.name} · flat allowances and loadings paid on top of base pay`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Allowances" value={categories.length} hint="Type: ALLOWANCE" tone="amber" />
        <StatCard label="Active" value={active} hint={`${categories.length - active} inactive`} tone="emerald" />
        <StatCard label="Taxable" value={taxable} hint="Count toward PAYG" tone="sky" />
        <StatCard label="Superable" value={superable} hint="Count toward super" tone="indigo" />
      </div>

      <div className="mb-3 mt-6 flex justify-end">
        <NewCategoryButton defaultType="ALLOWANCE" label="Add allowance" />
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="No allowance categories"
          hint="Add an allowance to pay a flat rate, per-kilometre amount or loading."
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
              <th className="th">Superable</th>
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
                <td className="td tabular-nums text-slate-700">
                  {rateLabel(Number(c.rate), c.unit)}
                </td>
                <td className="td text-slate-500">{c.unit.replace(/_/g, " ")}</td>
                <td className="td">
                  <Badge tone={c.isTaxable ? "green" : "slate"}>{c.isTaxable ? "Yes" : "No"}</Badge>
                </td>
                <td className="td">
                  <Badge tone={c.isSuperable ? "green" : "slate"}>{c.isSuperable ? "Yes" : "No"}</Badge>
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
  );
}
