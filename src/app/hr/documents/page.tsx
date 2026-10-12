import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { ChartPanel, Donut, BarList, type DonutSegment } from "@/components/charts";
import { formatDate, daysFromNow, daysUntil, cx } from "@/lib/format";

const PAGE_SIZE = 25;
const EXPIRING_WINDOW_DAYS = 60;

/** Chart palette (distinct from Badge tones). */
const CATEGORY_TONES = [
  "sky",
  "emerald",
  "amber",
  "violet",
  "rose",
  "teal",
  "fuchsia",
  "indigo",
  "slate",
] as const;

function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function HrDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    employee?: string;
    confidential?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();

  const q = strParam(sp.q);
  const category = strParam(sp.category);
  const employeeId = strParam(sp.employee);
  const confidential = sp.confidential === "1";
  const page = intParam(sp.page, 1, 500);

  const where = {
    organisationId,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { fileName: { contains: q, mode: "insensitive" as const } },
            { employee: { firstName: { contains: q, mode: "insensitive" as const } } },
            { employee: { lastName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(category ? { category } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(confidential ? { isConfidential: true } : {}),
  };

  const [
    total,
    documents,
    categoryGroups,
    employees,
    totalOrg,
    confidentialOrg,
    expiringSoon,
    expiredOrg,
  ] = await Promise.all([
    prisma.employeeDocument.count({ where }),
    prisma.employeeDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      },
    }),
    prisma.employeeDocument.groupBy({
      by: ["category"],
      where: { organisationId },
      _count: true,
      orderBy: { _count: { category: "desc" } },
    }),
    prisma.employee.findMany({
      where: { organisationId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.employeeDocument.count({ where: { organisationId } }),
    prisma.employeeDocument.count({ where: { organisationId, isConfidential: true } }),
    prisma.employeeDocument.count({
      where: {
        organisationId,
        expiryDate: { gte: daysFromNow(0), lte: daysFromNow(EXPIRING_WINDOW_DAYS) },
      },
    }),
    prisma.employeeDocument.count({
      where: { organisationId, expiryDate: { lt: daysFromNow(0) } },
    }),
  ]);

  const categories = categoryGroups.map((c) => c.category);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const segments: DonutSegment[] = categoryGroups.map((c, i) => ({
    label: c.category,
    value: c._count,
    tone: CATEGORY_TONES[i % CATEGORY_TONES.length],
  }));

  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/hr/documents${qs({
      q,
      category,
      employee: employeeId,
      confidential: confidential ? "1" : "",
      page,
      ...overrides,
    })}`;

  return (
    <div>
      <PageHeader
        title="All documents"
        subtitle="Org-wide document register — contracts, compliance paperwork and certificates on file."
        action={{ label: "Upload documents", href: "/hr/documents/upload" }}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Documents" value={totalOrg} hint="Across all employees" tone="sky" />
        <StatCard label="Confidential" value={confidentialOrg} hint="Restricted access" tone="amber" />
        <StatCard
          label="Expiring soon"
          value={expiringSoon}
          hint={`Next ${EXPIRING_WINDOW_DAYS} days`}
          tone={expiringSoon ? "amber" : "emerald"}
        />
        <StatCard
          label="Expired"
          value={expiredOrg}
          hint="Past their expiry date"
          tone={expiredOrg ? "rose" : "emerald"}
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Documents by category" subtitle="Distribution across the register">
          <Donut
            segments={segments}
            size={140}
            thickness={16}
            centerValue={totalOrg}
            centerLabel="documents"
          />
        </ChartPanel>
        <ChartPanel title="Top categories" subtitle="Largest document groups">
          <BarList
            items={categoryGroups.slice(0, 8).map((c, i) => ({
              label: c.category,
              value: c._count,
              tone: CATEGORY_TONES[i % CATEGORY_TONES.length],
              href: pageHref({ category: c.category, page: 1 }),
            }))}
            valueFormat={(v) => String(v)}
          />
        </ChartPanel>
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2" action="/hr/documents" method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search title, file or employee…"
            className="input !w-64"
          />
          {category && <input type="hidden" name="category" value={category} />}
          {employeeId && <input type="hidden" name="employee" value={employeeId} />}
          {confidential && <input type="hidden" name="confidential" value="1" />}
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>

        <form className="flex flex-wrap items-center gap-2" action="/hr/documents" method="get">
          {q && <input type="hidden" name="q" value={q} />}
          {confidential && <input type="hidden" name="confidential" value="1" />}
          <select name="category" defaultValue={category} className="input !w-44">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select name="employee" defaultValue={employeeId} className="input !w-56">
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName} ({e.employeeNumber})
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>

        <Link
          href={pageHref({ confidential: confidential ? "" : "1", page: 1 })}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            confidential ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {confidential ? "🔒 Confidential only" : "Confidential only"}
        </Link>
      </div>

      {/* ── Table ── */}
      <div className="mt-4">
        {documents.length === 0 ? (
          <EmptyState
            title="No documents match these filters"
            hint="Record a document or clear the search, category and employee filters."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Title</th>
                  <th className="th">Category</th>
                  <th className="th">File</th>
                  <th className="th">Expiry</th>
                  <th className="th">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((d) => {
                  const days = d.expiryDate ? daysUntil(d.expiryDate) : null;
                  const expired = days !== null && days < 0;
                  const expiring = days !== null && days >= 0 && days <= EXPIRING_WINDOW_DAYS;
                  return (
                    <tr
                      key={d.id}
                      className={cx(
                        "hover:bg-slate-50/70",
                        expired ? "bg-rose-50/40" : expiring ? "bg-amber-50/40" : ""
                      )}
                    >
                      <td className="td">
                        <Link
                          href={`/hr/employees/${d.employee.id}`}
                          className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                        >
                          {d.employee.firstName} {d.employee.lastName}
                        </Link>
                        <div className="text-[11px] text-slate-400">{d.employee.employeeNumber}</div>
                      </td>
                      <td className="td font-medium text-slate-700">{d.title}</td>
                      <td className="td">
                        <Badge tone="blue">{d.category}</Badge>
                      </td>
                      <td className="td">
                        <div className="text-slate-600">{d.fileName}</div>
                        <div className="text-[11px] text-slate-400">{formatSize(d.fileSize)}</div>
                      </td>
                      <td className="td whitespace-nowrap">
                        {d.expiryDate ? (
                          <Badge tone={expired ? "red" : expiring ? "amber" : "slate"}>
                            {expired ? "EXPIRED " : expiring ? `${days}d · ` : ""}
                            {formatDate(d.expiryDate)}
                          </Badge>
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

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={pageHref({ page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                    ← Previous
                  </Link>
                ) : (
                  <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                    ← Previous
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link href={pageHref({ page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                    Next →
                  </Link>
                ) : (
                  <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                    Next →
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
