import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext, qs, intParam, strParam } from "@/lib/employee";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, daysUntil, daysFromNow } from "@/lib/format";

const PAGE_SIZE = 15;
const EXPIRING_WINDOW_DAYS = 60;

/** Chart palette — distinct from Badge tones. */
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

function ExpiryCell({ date }: { date: Date | null }) {
  if (!date) return <span className="text-slate-400">—</span>;
  const days = daysUntil(date);
  if (days < 0) return <Badge tone="red">Expired {formatDate(date)}</Badge>;
  if (days <= EXPIRING_WINDOW_DAYS) return <Badge tone="amber">Expires in {days}d</Badge>;
  return <Badge tone="slate">Expires {formatDate(date)}</Badge>;
}

export default async function MyDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { employee, organisationId } = await employeeContext();
  const category = strParam(sp.category);
  const page = intParam(sp.page, 1, 500);

  const where = {
    employeeId: employee.id,
    organisationId,
    ...(category ? { category } : {}),
  };

  const [totalRows, docs, categoryGroups, expiringSoon] = await Promise.all([
    prisma.employeeDocument.count({ where }),
    prisma.employeeDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.employeeDocument.groupBy({
      by: ["category"],
      where: { employeeId: employee.id, organisationId },
      _count: true,
      orderBy: { _count: { category: "desc" } },
    }),
    prisma.employeeDocument.count({
      where: {
        employeeId: employee.id,
        organisationId,
        expiryDate: { gte: daysFromNow(0), lte: daysFromNow(EXPIRING_WINDOW_DAYS) },
      },
    }),
  ]);

  const totalDocs = categoryGroups.reduce((a, c) => a + c._count, 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const categories = categoryGroups.map((c) => c.category);

  const segments: DonutSegment[] = categoryGroups.map((c, i) => ({
    label: c.category,
    value: c._count,
    tone: CATEGORY_TONES[i % CATEGORY_TONES.length],
  }));

  const pageHref = (p: number) =>
    `/employee/documents${qs({ category, page: p > 1 ? p : undefined })}`;

  return (
    <div>
      <PageHeader
        title="Employment documents"
        subtitle="Documents on your employee file · newest first"
        action={{ label: "Upload documents", href: "/employee/documents/upload" }}
      />

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Documents" value={totalDocs} hint="On your file" tone="indigo" />
        <StatCard
          label="Categories"
          value={categories.length}
          hint="Distinct document types"
          tone="sky"
        />
        <StatCard
          label="Expiring soon"
          value={expiringSoon}
          hint={`Within ${EXPIRING_WINDOW_DAYS} days`}
          tone={expiringSoon ? "amber" : "emerald"}
        />
      </div>

      {/* ── Category mix ── */}
      {totalDocs > 0 && (
        <div className="mt-5">
          <ChartPanel title="Documents by category" subtitle="Your document mix">
            <Donut segments={segments} size={140} thickness={16} centerValue={totalDocs} centerLabel="documents" />
          </ChartPanel>
        </div>
      )}

      {/* ── Category filter chips ── */}
      <div className="mt-6 flex flex-wrap gap-1.5">
        {["ALL", ...categories].map((c) => {
          const active = category ? category === c : c === "ALL";
          return (
            <Link
              key={c}
              href={`/employee/documents${qs({ category: c === "ALL" ? undefined : c, page: undefined })}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                active ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {c}
            </Link>
          );
        })}
      </div>

      {/* ── Documents table ── */}
      <div className="mt-4">
        {docs.length === 0 ? (
          <EmptyState
            title={category ? `No ${category} documents` : "No documents on file yet"}
            hint="Upload a document and it will appear here for you and HR to see."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Title</th>
                  <th className="th">Category</th>
                  <th className="th">File name</th>
                  <th className="th">Size</th>
                  <th className="th">Uploaded</th>
                  <th className="th">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {docs.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">{d.title}</td>
                    <td className="td">
                      <Badge tone="purple">{d.category}</Badge>
                    </td>
                    <td className="td max-w-[220px] truncate text-slate-500">{d.fileName}</td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {d.fileSize > 0 ? `${(d.fileSize / 1024).toFixed(1)} KB` : "—"}
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDate(d.createdAt)}</td>
                    <td className="td whitespace-nowrap">
                      <ExpiryCell date={d.expiryDate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} of{" "}
                  {totalRows}
                </p>
                <div className="flex items-center gap-2">
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)} className="btn-secondary !py-1.5 text-xs">
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
                    <Link href={pageHref(page + 1)} className="btn-secondary !py-1.5 text-xs">
                      Next →
                    </Link>
                  ) : (
                    <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                      Next →
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
