import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, strParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { BarList, ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, isPast, cx } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

/** Core records that should remain on file for a departing employee. */
const CORE_DOCS = [
  { category: "Contract", label: "Employment contract" },
  { category: "Tax", label: "Tax & super forms" },
  { category: "Identification", label: "Photo identification" },
];

const WINDOWS = [90, 180, 365] as const;
const PAGE_SIZE = 40;

export default async function ExitDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();

  const q = strParam(sp.q);
  const parsedWindow = Number.parseInt(strParam(sp.w) || "180", 10);
  const windowDays = (WINDOWS as readonly number[]).includes(parsedWindow) ? parsedWindow : 180;
  const page = Math.max(1, Number.parseInt(strParam(sp.page) || "1", 10) || 1);

  const leavers = await prisma.employee.findMany({
    where: {
      organisationId,
      terminationDate: { not: null, gte: D(-windowDays) },
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
    orderBy: { terminationDate: "desc" },
    select: { id: true, firstName: true, lastName: true, employeeNumber: true, terminationDate: true },
  });

  const leaverIds = leavers.map((l) => l.id);
  const allDocs = leaverIds.length
    ? await prisma.employeeDocument.findMany({
        where: { organisationId, employeeId: { in: leaverIds } },
        orderBy: { createdAt: "desc" },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        },
      })
    : [];

  const totalDocs = allDocs.length;
  const totalPages = Math.max(1, Math.ceil(totalDocs / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const docs = allDocs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const confidential = allDocs.filter((d) => d.isConfidential).length;
  const expired = allDocs.filter((d) => isPast(d.expiryDate)).length;

  const heldByEmployee = new Map<string, Set<string>>();
  for (const d of allDocs) {
    const set = heldByEmployee.get(d.employeeId) ?? new Set<string>();
    set.add(d.category);
    heldByEmployee.set(d.employeeId, set);
  }
  const missingCore = leavers.filter((l) => {
    const held = heldByEmployee.get(l.id) ?? new Set<string>();
    return CORE_DOCS.some((c) => !held.has(c.category));
  }).length;
  const completeCore = leavers.length - missingCore;

  const categoryCounts = allDocs.reduce<Record<string, number>>((acc, d) => {
    acc[d.category] = (acc[d.category] ?? 0) + 1;
    return acc;
  }, {});
  const categoryItems = Object.entries(categoryCounts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const coreSegments: DonutSegment[] = (
    [
      { label: "Core records complete", value: completeCore, tone: "emerald" },
      { label: "Missing a core record", value: missingCore, tone: "amber" },
    ] as DonutSegment[]
  ).filter((s) => s.value > 0);

  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/hr/offboarding/documents${qs({ w: windowDays, q, page: safePage, ...overrides })}`;

  return (
    <div>
      <PageHeader
        title="Exit Documents"
        subtitle="Records held for departing employees, and any core documents still missing."
        action={{ label: "All documents", href: "/hr/documents" }}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Departing employees" value={leavers.length} hint={`Terminations in last ${windowDays} days`} tone="sky" />
        <StatCard label="Documents on file" value={totalDocs} hint="Across departing employees" tone="indigo" />
        <StatCard label="Missing core records" value={missingCore} hint="Employees with gaps" tone={missingCore ? "rose" : "emerald"} />
        <StatCard label="Confidential" value={confidential} hint={`${expired} expired`} tone="amber" />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Core records" subtitle="Departing employees by core-document coverage">
          <Donut
            segments={coreSegments}
            size={132}
            thickness={16}
            centerValue={leavers.length}
            centerLabel="leavers"
          />
        </ChartPanel>

        <ChartPanel title="Documents by category" subtitle="What is held for departing employees">
          <BarList items={categoryItems} tone="sky" valueFormat={(v) => String(v)} />
        </ChartPanel>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={pageHref({ w, page: 1 })}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                windowDays === w
                  ? "bg-sky-500 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              Last {w} days
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2" method="get">
          <input type="hidden" name="w" value={windowDays} />
          <input
            name="q"
            key={`q-${q}`}
            defaultValue={q}
            placeholder="Search employees…"
            className="input !w-56"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
          {q && (
            <Link href={pageHref({ q: "", page: 1 })} className="text-xs text-slate-500 hover:underline">
              Clear
            </Link>
          )}
        </form>
      </div>

      {docs.length === 0 ? (
        <EmptyState
          title="No exit documents found"
          hint="Documents belonging to employees with a termination date will appear here."
        />
      ) : (
        <>
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Document</th>
                <th className="th">Category</th>
                <th className="th">Uploaded</th>
                <th className="th">Expiry</th>
                <th className="th">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.map((d) => {
                const gotExpired = isPast(d.expiryDate);
                return (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <Link
                        href={`/hr/employees/${d.employee.id}`}
                        className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                      >
                        {d.employee.firstName} {d.employee.lastName}
                      </Link>
                      <div className="text-[11px] text-slate-400">{d.employee.employeeNumber}</div>
                    </td>
                    <td className="td">
                      <div className="font-medium text-slate-700">{d.title}</div>
                      <div className="text-[11px] text-slate-400">{d.fileName}</div>
                    </td>
                    <td className="td">
                      <Badge tone="blue">{d.category}</Badge>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDate(d.createdAt)}</td>
                    <td className="td whitespace-nowrap">
                      {d.expiryDate ? (
                        <span className={gotExpired ? "font-medium text-rose-600" : "text-slate-600"}>
                          {formatDate(d.expiryDate)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="td">
                      {d.isConfidential ? (
                        <Badge tone="purple">🔒 CONFIDENTIAL</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>

          {totalDocs > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalDocs)} of {totalDocs}
              </p>
              <div className="flex items-center gap-2">
                {safePage > 1 ? (
                  <Link href={pageHref({ page: safePage - 1 })} className="btn-secondary !py-1.5 text-xs">
                    ← Previous
                  </Link>
                ) : (
                  <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">← Previous</span>
                )}
                <span className="text-xs text-slate-500">
                  Page {safePage} of {totalPages}
                </span>
                {safePage < totalPages ? (
                  <Link href={pageHref({ page: safePage + 1 })} className="btn-secondary !py-1.5 text-xs">
                    Next →
                  </Link>
                ) : (
                  <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">Next →</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
