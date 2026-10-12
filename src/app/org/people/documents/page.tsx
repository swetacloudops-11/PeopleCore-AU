import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { formatDate, isPast } from "@/lib/format";
import { UploadDocumentButton, DocumentRowActions, type DocumentRow } from "./DocumentActions";

const PAGE_SIZE = 25;

const DEFAULT_CATEGORIES = [
  "Contract",
  "Tax",
  "Right to work",
  "Certification",
  "Policy",
  "Performance",
  "Other",
];

function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await orgContext();

  const q = strParam(sp.q);
  const category = strParam(sp.category);
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
  };

  const [total, documents, distinctCats, expiringCount, employeeCount] = await Promise.all([
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
    prisma.employeeDocument.findMany({
      where: { organisationId },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
    prisma.employeeDocument.count({
      where: { organisationId, expiryDate: { lt: new Date() } },
    }),
    prisma.employeeDocument.findMany({
      where: { organisationId },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
  ]);

  const categories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...distinctCats.map((c) => c.category)])
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const employeeOptions = await prisma.employee.findMany({
    where: { organisationId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
  });

  const rows: DocumentRow[] = documents.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    fileName: d.fileName,
    expiryDate: d.expiryDate ? d.expiryDate.toISOString() : null,
    isConfidential: d.isConfidential,
    employeeId: d.employee.id,
    employeeName: `${d.employee.firstName} ${d.employee.lastName}`,
  }));

  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/org/people/documents${qs({ q, category, page, ...overrides })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Employee documents
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Contracts, certifications and compliance paperwork on file.
          </p>
        </div>
        <UploadDocumentButton
          employees={employeeOptions.map((e) => ({
            id: e.id,
            name: `${e.firstName} ${e.lastName} (${e.employeeNumber})`,
          }))}
          categories={categories}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Documents" value={total} hint="Across all employees" tone="indigo" />
        <StatCard label="Employees covered" value={employeeCount.length} tone="emerald" />
        <StatCard label="Expired" value={expiringCount} hint="Past their expiry date" tone={expiringCount ? "rose" : "emerald"} />
        <StatCard
          label="Confidential"
          value={documents.filter((d) => d.isConfidential).length}
          hint="In current page view"
          tone="amber"
        />
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2" action="/org/people/documents" method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search title, file or employee…"
            className="input !w-64"
          />
          {category && <input type="hidden" name="category" value={category} />}
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>
        <form action="/org/people/documents" method="get" className="flex items-center gap-2">
          {q && <input type="hidden" name="q" value={q} />}
          <select name="category" defaultValue={category} className="input !w-48">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>
      </div>

      {/* ── Table ── */}
      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No documents match these filters"
            hint="Upload a document or clear the search and category filters."
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
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((d, i) => {
                  const row = rows[i];
                  const expired = isPast(d.expiryDate);
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/70">
                      <td className="td">
                        <Link
                          href={`/org/people/${d.employee.id}`}
                          className="font-medium text-slate-800 hover:text-indigo-600 hover:underline"
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
                          <Badge tone={expired ? "red" : "amber"}>
                            {expired ? "EXPIRED " : "expires "}
                            {formatDate(d.expiryDate)}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="td">
                        {d.isConfidential ? <Badge tone="purple">🔒 CONFIDENTIAL</Badge> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="td">
                        <DocumentRowActions document={row} categories={categories} />
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
