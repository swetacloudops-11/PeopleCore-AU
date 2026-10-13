import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs, strParam } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment, type Tone } from "@/components/charts";
import { formatMoney } from "@/lib/format";
import CategoryActions, { NewCategoryButton } from "./CategoryActions";

export const dynamic = "force-dynamic";

const TYPES = [
  "ORDINARY",
  "OVERTIME",
  "ALLOWANCE",
  "BONUS",
  "SUPER",
  "TAX",
  "DEDUCTION",
  "REIMBURSEMENT",
] as const;

type CategoryType = (typeof TYPES)[number];

const isType = (value: string): value is CategoryType =>
  (TYPES as readonly string[]).includes(value);

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

const TYPE_CHART: Record<string, Tone> = {
  ORDINARY: "amber",
  OVERTIME: "violet",
  ALLOWANCE: "sky",
  BONUS: "emerald",
  SUPER: "teal",
  TAX: "rose",
  DEDUCTION: "slate",
  REIMBURSEMENT: "indigo",
};

const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

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

export default async function PayCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await payrollContext();
  const type = strParam(sp.type) || "ALL";

  const where = {
    organisationId,
    ...(type !== "ALL" && isType(type) ? { type } : {}),
  };

  const [categories, groups, inactiveCount] = await Promise.all([
    prisma.payCategory.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.payCategory.groupBy({ by: ["type"], where: { organisationId }, _count: true }),
    prisma.payCategory.count({ where: { organisationId, isActive: false } }),
  ]);

  const countByType = Object.fromEntries(groups.map((g) => [g.type, g._count]));
  const totalAll = groups.reduce((a, g) => a + g._count, 0);

  const segments = groups.map(
    (g): DonutSegment => ({
      label: label(g.type),
      value: g._count,
      tone: TYPE_CHART[g.type] ?? "slate",
    })
  );

  const chips = [
    { key: undefined as string | undefined, label: "All", n: totalAll },
    ...groups
      .slice()
      .sort((a, b) => a.type.localeCompare(b.type))
      .map((g) => ({ key: g.type as string | undefined, label: label(g.type), n: g._count })),
  ];

  return (
    <div>
      <PageHeader
        title="All Pay Categories"
        subtitle={`${org.name} · earnings, loadings, allowances and deductions used to cost payroll`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Categories" value={totalAll} hint="All types" tone="amber" />
        <StatCard label="Ordinary" value={countByType.ORDINARY ?? 0} hint="Base hours" tone="indigo" />
        <StatCard label="Overtime" value={countByType.OVERTIME ?? 0} hint="Penalty multipliers" tone="sky" />
        <StatCard label="Allowances" value={countByType.ALLOWANCE ?? 0} hint="Loadings & allowances" tone="emerald" />
        <StatCard label="Inactive" value={inactiveCount} hint="Not used in pay runs" tone="rose" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            {chips.map((c) => (
              <Link
                key={c.label}
                href={`/payroll/categories${qs({ type: c.key })}`}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  (type === "ALL" ? "All" : label(type)) === c.label
                    ? "bg-amber-500 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {c.label} · {c.n}
              </Link>
            ))}
          </div>

          <div className="mb-3 flex justify-end">
            <NewCategoryButton />
          </div>

          {categories.length === 0 ? (
            <EmptyState
              title="No pay categories yet"
              hint="Create categories such as Ordinary Hours, Overtime and Allowances to cost pay runs."
            />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Code</th>
                  <th className="th">Name</th>
                  <th className="th">Type</th>
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
                    <td className="td">
                      <Badge tone={TYPE_BADGE[c.type] ?? "slate"}>{label(c.type)}</Badge>
                    </td>
                    <td className="td tabular-nums text-slate-700">
                      {rateLabel(Number(c.rate), c.unit)}
                      <span className="ml-1 text-[10px] uppercase text-slate-400">
                        {c.unit.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="td">
                      <Badge tone={c.isTaxable ? "green" : "slate"}>
                        {c.isTaxable ? "Yes" : "No"}
                      </Badge>
                    </td>
                    <td className="td">
                      <Badge tone={c.isSuperable ? "green" : "slate"}>
                        {c.isSuperable ? "Yes" : "No"}
                      </Badge>
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

        <ChartPanel title="Categories by type" subtitle="Share of all pay categories">
          <Donut segments={segments} centerValue={totalAll} centerLabel="categories" />
        </ChartPanel>
      </div>
    </div>
  );
}
