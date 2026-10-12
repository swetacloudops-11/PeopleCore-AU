import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { Badge, TableWrap, EmptyState, StatCard } from "@/components/ui";
import { NewCategoryButton, CategoryRowActions } from "./CategoryManager";

export const dynamic = "force-dynamic";

const PAGE = 25;

const TYPE_TONE: Record<string, string> = {
  ORDINARY: "blue",
  OVERTIME: "purple",
  ALLOWANCE: "amber",
  BONUS: "green",
  SUPER: "green",
  TAX: "red",
  DEDUCTION: "slate",
  REIMBURSEMENT: "blue",
};

export default async function PayCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; active?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const q = strParam(sp.q);
  const page = intParam(sp.page, 1);
  const active = sp.active === "INACTIVE" ? false : sp.active === "ACTIVE" ? true : undefined;

  const where = {
    organisationId,
    ...(active !== undefined ? { isActive: active } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { code: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, categories, flags] = await Promise.all([
    prisma.payCategory.count({ where }),
    prisma.payCategory.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.payCategory.findMany({
      where: { organisationId },
      select: { isActive: true, isTaxable: true, isSuperable: true },
    }),
  ]);

  const activeCount = flags.filter((f) => f.isActive).length;
  const totalAll = flags.length;
  const taxable = flags.filter((f) => f.isTaxable).length;
  const superable = flags.filter((f) => f.isSuperable).length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = { q: q || undefined, active: sp.active || undefined };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Pay categories
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · earnings, allowances, deductions and taxes used to cost payroll
          </p>
        </div>
        <NewCategoryButton />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Categories" value={totalAll} hint="All types" tone="indigo" />
        <StatCard
          label="Active"
          value={activeCount}
          hint={`${totalAll - activeCount} inactive`}
          tone="emerald"
        />
        <StatCard label="Taxable" value={taxable} hint="Count toward PAYG" tone="sky" />
        <StatCard label="Superable" value={superable} hint="Count toward super" tone="amber" />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          { key: undefined, label: "All", n: totalAll },
          { key: "ACTIVE", label: "Active", n: activeCount },
          { key: "INACTIVE", label: "Inactive", n: totalAll - activeCount },
        ].map((c) => (
          <Link
            key={c.label}
            href={qs({ ...base, active: c.key, page: 1 })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              (sp.active ?? "ALL") === (c.key ?? "ALL")
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {c.label} · {c.n}
          </Link>
        ))}
      </div>

      <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="cat-q">Search</label>
          <input
            id="cat-q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by name or code…"
          />
        </div>
        {sp.active && <input type="hidden" name="active" value={sp.active} />}
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      <div className="mt-4">
        {categories.length === 0 ? (
          <EmptyState
            title="No pay categories yet"
            hint="Create categories such as Ordinary Hours, Overtime and Allowances to cost pay runs."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Category</th>
                <th className="th">Code</th>
                <th className="th">Type</th>
                <th className="th">Taxable</th>
                <th className="th">Superable</th>
                <th className="th text-right">Rate</th>
                <th className="th">Unit</th>
                <th className="th text-right">Order</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">{c.name}</td>
                  <td className="td">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                      {c.code}
                    </code>
                  </td>
                  <td className="td">
                    <Badge tone={TYPE_TONE[c.type] ?? "slate"}>{c.type}</Badge>
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
                  <td className="td text-right tabular-nums text-slate-700">
                    {Number(c.rate).toFixed(2)}
                  </td>
                  <td className="td text-slate-500">{c.unit}</td>
                  <td className="td text-right tabular-nums text-slate-500">
                    {c.sortOrder}
                  </td>
                  <td className="td">
                    <Badge tone={c.isActive ? "green" : "red"}>
                      {c.isActive ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </td>
                  <td className="td">
                    <CategoryRowActions
                      category={{
                        id: c.id,
                        name: c.name,
                        code: c.code,
                        type: c.type,
                        isTaxable: c.isTaxable,
                        isSuperable: c.isSuperable,
                        rate: Number(c.rate),
                        unit: c.unit,
                        isActive: c.isActive,
                        sortOrder: c.sortOrder,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {pages} · {total} categories
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ ...base, page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                ← Previous
              </Link>
            )}
            {page < pages && (
              <Link href={qs({ ...base, page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
