import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext, qs } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import SettingsForm, { type SettingRow } from "../SettingsForm";

export const dynamic = "force-dynamic";

export default async function PayCategoriesSettingsPage() {
  const { organisationId, org } = await payrollContext();

  const [rows, categories, activeCount, typeGroups] = await Promise.all([
    prisma.orgSetting.findMany({
      where: {
        organisationId,
        OR: [
          { key: { in: ["default_ordinary_rate", "category_sort", "category_sort_order"] } },
          { key: { contains: "categor" } },
        ],
      },
      orderBy: { key: "asc" },
    }),
    prisma.payCategory.findMany({
      where: { organisationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 8,
    }),
    prisma.payCategory.count({ where: { organisationId, isActive: true } }),
    prisma.payCategory.groupBy({ by: ["type"], where: { organisationId }, _count: true }),
  ]);

  const settings: SettingRow[] = rows.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    value: s.value,
    dataType: s.dataType,
    isSecret: s.isSecret,
    group: s.group,
  }));

  const defaultRate = rows.find((r) => r.key === "default_ordinary_rate")?.value;
  const sortBehaviour = rows.find((r) => r.key === "category_sort" || r.key === "category_sort_order")?.value;

  return (
    <div>
      <PageHeader
        title="Pay Categories Settings"
        subtitle={`${org.name} · default rates and how categories are ordered`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Default ordinary rate"
          value={defaultRate ? formatMoney(Number(defaultRate)) : "—"}
          hint="Fallback hourly rate"
          tone="amber"
        />
        <StatCard label="Categories" value={typeGroups.reduce((a, g) => a + g._count, 0)} hint="All types" tone="indigo" />
        <StatCard label="Active" value={activeCount} hint="Used in pay runs" tone="emerald" />
        <StatCard label="Type groups" value={typeGroups.length} hint="Distinct types" tone="sky" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-800">Default ordinary rate</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Applied when an employee has no specific ordinary rate. When unset, the ordinary
            category rate is used instead.
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-900">
            {defaultRate ? formatMoney(Number(defaultRate)) : "Not configured"}
          </p>
        </div>
        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-800">Sort behaviour</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Categories are listed by their sort order, then alphabetically. Lower sort numbers
            appear first on payslips and pay run breakdowns.
          </p>
          <p className="mt-3">
            <Badge tone="amber">{sortBehaviour ? sortBehaviour.replace(/_/g, " ") : "sortOrder asc"}</Badge>
          </p>
        </div>
      </div>

      <div className="mt-6">
        <SettingsForm settings={settings} title="categories" />
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Categories in use</h2>
          <Link href="/payroll/categories" className="text-xs text-amber-600 hover:underline">
            Manage all categories →
          </Link>
        </div>

        {categories.length === 0 ? (
          <EmptyState
            title="No categories yet"
            hint="Create pay categories to control how pay run lines are costed."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Code</th>
                <th className="th">Name</th>
                <th className="th">Type</th>
                <th className="th">Rate</th>
                <th className="th">Status</th>
                <th className="th text-right">Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <Link
                      href={`/payroll/categories${qs({ type: c.type })}`}
                      className="text-slate-700 hover:text-amber-600 hover:underline"
                    >
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{c.code}</code>
                    </Link>
                  </td>
                  <td className="td font-medium text-slate-800">{c.name}</td>
                  <td className="td text-slate-500">
                    {c.type.charAt(0) + c.type.slice(1).toLowerCase()}
                  </td>
                  <td className="td tabular-nums text-slate-700">
                    {Number(c.rate).toFixed(2)} {c.unit.replace(/_/g, " ")}
                  </td>
                  <td className="td">
                    <Badge tone={c.isActive ? "green" : "red"}>
                      {c.isActive ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </td>
                  <td className="td text-right tabular-nums text-slate-500">{c.sortOrder}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}
