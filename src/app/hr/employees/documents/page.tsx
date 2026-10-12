import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { daysFromNow, formatDate, isPast } from "@/lib/format";

const PAGE_SIZE = 25;
const EXPIRING_WINDOW_DAYS = 60;

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

export default async function EmployeeDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; employee?: string; category?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();

  const q = strParam(sp.q);
  const employeeId = strParam(sp.employee);
  const category = strParam(sp.category);
  const page = intParam(sp.page, 1, 500);

  const where = {
    organisationId,
    ...(employeeId ? { employeeId } : {}),
    ...(category ? { category } : {}),
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
  };

  const [
    total,
    documents,
    distinctCats,
    employees,
    covered,
    expiringSoon,
    expired,
    byCategory,
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
    prisma.employeeDocument.findMany({
      where: { organisationId },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
    prisma.employee.findMany({
      where: { organisationId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.employeeDocument.findMany({
      where: { organisationId },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
    prisma.employeeDocument.count({
      where: {
        organisationId,
        expiryDate: { gte: daysFromNow(0), lte: daysFromNow(EXPIRING_WINDOW_DAYS) },
      },
    }),
    prisma.employeeDocument.count({ where: { organisationId, expiryDate: { lt: daysFromNow(0) } } }),
    prisma.employeeDocument.groupBy({
      by: ["category"],
      where: { organisationId },
      _count: true,
      orderBy: { _count: { category: "desc" } },
      take: 8,
    }),
  ]);

  const categories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...distinctCats.map((c) => c.category)])
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const segments = byCategory.map((c) => ({
    label: c.category,
    value: c._count,
  })) as DonutSegment[];
  const totalDocs = byCategory.reduce((a, c) => a + c._count, 0);

  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/hr/employees/documents${qs({ q, employee: employeeId, category, page, ...overrides })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/hr/employees" className="text-xs font-medium text-sky-600 hover:underline">
            ← Back to employees
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Employee documents
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Contracts, certifications and compliance paperwork on file.
          </p>
        </div>
        <Link href="/hr/documents/upload" className="btn-primary">
          + Upload document
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Documents" value={total} hint="Matching filters" tone="sky" />
        <StatCard label="Employees covered" value={covered.length} hint="With at least one file" tone="emerald" />
        <StatCard
          label="Expiring soon"
          value={expiringSoon}
          hint={`Next ${EXPIRING_WINDOW_DAYS} days`}
          tone={expiringSoon ? "amber" : "emerald"}
        />
        <StatCard
          label="Expired"
          value={expired}
          hint="Past their expiry date"
          tone={expired ? "rose" : "emerald"}
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Documents by category" subtitle="Across the whole organisation">
          <Donut
            segments={segments}
            size={136}
            thickness={16}
            centerValue={totalDocs}
            centerLabel="documents"
          />
        </ChartPanel>
        <ChartPanel title="Compliance snapshot" subtitle="Expiry risk across the file room">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-500">Expiring in {EXPIRING_WINDOW_DAYS} days</span>
              <Badge tone={expiringSoon ? "amber" : "slate"}>{expiringSoon}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-500">Already expired</span>
              <Badge tone={expired ? "red" : "slate"}>{expired}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-500">Employees with no documents</span>
              <Badge tone="slate">{Math.max(0, employees.length - covered.length)}</Badge>
            </li>
            <li className="pt-2">
              <Link href="/hr/documents/expiry" className="text-xs font-medium text-sky-600 hover:underline">
                Review all expiring documents →
              </Link>
            </li>
          </ul>
        </ChartPanel>
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2" action="/hr/employees/documents" method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search title, file or employee…"
            className="input !w-64"
          />
          {category && <input type="hidden" name="category" value={category} />}
          {employeeId && <input type="hidden" name="employee" value={employeeId} />}
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>
        <form action="/hr/employees/documents" method="get" className="flex items-center gap-2">
          {q && <input type="hidden" name="q" value={q} />}
          {category && <input type="hidden" name="category" value={category} />}
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
        <form action="/hr/employees/documents" method="get" className="flex items-center gap-2">
          {q && <input type="hidden" name="q" value={q} />}
          {employeeId && <input type="hidden" name="employee" value={employeeId} />}
          <select name="category" defaultValue={category} className="input !w-44">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Apply
          </button>
        </form>
      </div>

      {/* ── Table ── */}
      <div className="mt-4">
        {documents.length === 0 ? (
          <EmptyState
            title="No documents match these filters"
            hint="Upload a document or clear the search, employee and category filters."
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
                  const expired = isPast(d.expiryDate);
                  const expiring =
                    !expired &&
                    d.expiryDate !== null &&
                    d.expiryDate.getTime() <= daysFromNow(EXPIRING_WINDOW_DAYS).getTime();
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
                            {expired ? "EXPIRED " : expiring ? "EXPIRING " : "Expires "}
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
