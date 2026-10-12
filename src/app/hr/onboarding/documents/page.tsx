import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, strParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { BarList, ChartPanel, Donut, ProgressBar, type DonutSegment } from "@/components/charts";
import { formatDate, cx } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

/** Documents every new starter must have on file (matched against document categories). */
const REQUIRED_DOCS: Array<{ category: string; label: string }> = [
  { category: "Contract", label: "Employment contract" },
  { category: "Tax", label: "Tax & super forms" },
  { category: "Identification", label: "Photo identification" },
  { category: "Police Check", label: "Police check" },
  { category: "Qualification", label: "Qualification evidence" },
];

const WINDOW_DAYS = 90;

export default async function OnboardingDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();
  const q = strParam(sp.q);

  const starters = await prisma.employee.findMany({
    where: {
      organisationId,
      employmentStatus: { not: "TERMINATED" },
      hireDate: { gte: D(-WINDOW_DAYS) },
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { employeeNumber: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { hireDate: "desc" },
    include: {
      position: { select: { title: true } },
      department: { select: { name: true } },
    },
  });

  const starterIds = starters.map((s) => s.id);
  const docs = starterIds.length
    ? await prisma.employeeDocument.findMany({
        where: { organisationId, employeeId: { in: starterIds } },
        select: { employeeId: true, category: true },
      })
    : [];

  const byEmployee = new Map<string, Set<string>>();
  for (const d of docs) {
    const set = byEmployee.get(d.employeeId) ?? new Set<string>();
    set.add(d.category);
    byEmployee.set(d.employeeId, set);
  }

  const rows = starters.map((s) => {
    const held = byEmployee.get(s.id) ?? new Set<string>();
    const missing = REQUIRED_DOCS.filter((r) => !held.has(r.category));
    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      employeeNumber: s.employeeNumber,
      hireDate: s.hireDate,
      position: s.position?.title ?? null,
      department: s.department?.name ?? null,
      held,
      missing,
      complete: missing.length === 0,
    };
  });

  const compliant = rows.filter((r) => r.complete).length;
  const missingItems = rows.reduce((a, r) => a + r.missing.length, 0);
  const compliancePct = rows.length ? Math.round((compliant / rows.length) * 100) : 0;

  // Which required documents are most often missing.
  const missingByDoc = REQUIRED_DOCS.map((r) => ({
    label: r.label,
    value: rows.filter((row) => !row.held.has(r.category)).length,
  })).sort((a, b) => b.value - a.value);
  const missingItemsList = missingByDoc.filter((m) => m.value > 0);

  const complianceSegments: DonutSegment[] = (
    [
      { label: "Fully documented", value: compliant, tone: "emerald" },
      { label: "Missing something", value: rows.length - compliant, tone: "amber" },
    ] as DonutSegment[]
  ).filter((s) => s.value > 0);

  return (
    <div>
      <PageHeader
        title="Required Documents"
        subtitle="Which documents each new starter has filed, and what is still outstanding."
        action={{ label: "All documents", href: "/hr/documents" }}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="New starters" value={rows.length} hint={`Hired in last ${WINDOW_DAYS} days`} tone="sky" />
        <StatCard label="Fully documented" value={compliant} hint={`${compliancePct}% of new starters`} tone="emerald" />
        <StatCard label="Outstanding items" value={missingItems} hint="Documents still required" tone={missingItems ? "rose" : "emerald"} />
        <StatCard label="Documents on file" value={docs.length} hint="Across new starters" tone="indigo" />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Compliance overview" subtitle="New starters by document completeness">
          <Donut
            segments={complianceSegments}
            size={132}
            thickness={16}
            centerValue={`${compliancePct}%`}
            centerLabel="complete"
          />
          <div className="mt-4 border-t border-slate-100 pt-3">
            <ProgressBar
              value={compliant}
              max={Math.max(1, rows.length)}
              tone={compliancePct >= 70 ? "emerald" : "sky"}
              label="Documentation complete"
            />
          </div>
        </ChartPanel>

        <ChartPanel title="Most-missing documents" subtitle="New starters without each required document">
          {missingItemsList.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Every new starter is fully documented</p>
          ) : (
            <BarList items={missingItemsList} tone="rose" valueFormat={(v) => `${v}`} showPercents={false} />
          )}
        </ChartPanel>
      </div>

      <form className="mb-4 flex items-center gap-2" method="get">
        <input
          name="q"
          key={`q-${q}`}
          defaultValue={q}
          placeholder="Search new starters…"
          className="input !w-64"
        />
        <button type="submit" className="btn-secondary">
          Search
        </button>
        {q && (
          <Link href="/hr/onboarding/documents" className="text-xs text-slate-500 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No new starters in the last 90 days"
          hint="Document requirements will surface here once employees are hired."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Employee</th>
              <th className="th">Role</th>
              <th className="th">Started</th>
              <th className="th">Required documents</th>
              <th className="th text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className={cx("hover:bg-slate-50/70", !r.complete && "bg-amber-50/30")}>
                <td className="td">
                  <Link
                    href={`/hr/employees/${r.id}`}
                    className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                  >
                    {r.firstName} {r.lastName}
                  </Link>
                  <div className="text-[11px] text-slate-400">{r.employeeNumber}</div>
                </td>
                <td className="td">
                  <div className="text-slate-700">{r.position ?? "—"}</div>
                  <div className="text-[11px] text-slate-400">{r.department ?? "—"}</div>
                </td>
                <td className="td whitespace-nowrap text-slate-500">{formatDate(r.hireDate)}</td>
                <td className="td">
                  <div className="flex flex-wrap gap-1.5">
                    {REQUIRED_DOCS.map((req) => {
                      const has = r.held.has(req.category);
                      return (
                        <span
                          key={req.category}
                          title={req.label}
                          className={cx(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                            has
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          )}
                        >
                          {has ? "✓" : "✕"} {req.label}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="td text-right">
                  {r.complete ? (
                    <Badge tone="green">COMPLETE</Badge>
                  ) : (
                    <Badge tone="amber">
                      {r.missing.length} missing
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
