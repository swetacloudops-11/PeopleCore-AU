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

export default async function OrdinaryHoursPage() {
  const { organisationId, org } = await payrollContext();

  const categories = await prisma.payCategory.findMany({
    where: { organisationId, type: "ORDINARY" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const active = categories.filter((c) => c.isActive).length;
  const taxable = categories.filter((c) => c.isTaxable).length;
  const superable = categories.filter((c) => c.isSuperable).length;

  return (
    <div>
      <PageHeader
        title="Ordinary Hours"
        subtitle={`${org.name} · the base rate used for standard hours before loadings`}
      />

      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
        <p className="font-semibold">How ordinary hours work</p>
        <p className="mt-1">
          Ordinary categories cover standard, non-penalty time. The hourly rate here is used
          for the base component of a shift; overtime, weekend and public-holiday loadings are
          applied on top when those conditions are met.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Ordinary categories" value={categories.length} hint="Type: ORDINARY" tone="amber" />
        <StatCard label="Active" value={active} hint={`${categories.length - active} inactive`} tone="emerald" />
        <StatCard label="Taxable" value={taxable} hint="Count toward PAYG" tone="sky" />
        <StatCard label="Superable" value={superable} hint="Count toward super" tone="indigo" />
      </div>

      <div className="mb-3 mt-6 flex justify-end">
        <NewCategoryButton defaultType="ORDINARY" label="Add ordinary rate" />
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="No ordinary categories"
          hint="Add an ordinary-hours category to define the base rate for standard time."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Code</th>
              <th className="th">Name</th>
              <th className="th">Rate</th>
              <th className="th">Taxable</th>
              <th className="th">Superable</th>
              <th className="th">Status</th>
              <th className="th text-right">Order</th>
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
                <td className="td text-right tabular-nums text-slate-500">{c.sortOrder}</td>
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
