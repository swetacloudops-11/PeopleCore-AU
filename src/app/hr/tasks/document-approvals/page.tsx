import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { BarList, ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { formatDate, isPast } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

/** Documents uploaded within this window are surfaced as awaiting HR review. */
const REVIEW_WINDOW_DAYS = 30;

export default async function DocumentApprovalsPage() {
  const { organisationId } = await hrContext();

  const documents = await prisma.employeeDocument.findMany({
    where: { organisationId, createdAt: { gte: D(-REVIEW_WINDOW_DAYS) } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
    },
  });

  const confidential = documents.filter((d) => d.isConfidential).length;
  const expired = documents.filter((d) => isPast(d.expiryDate)).length;
  const employees = new Set(documents.map((d) => d.employee.id)).size;

  const categoryCounts = documents.reduce<Record<string, number>>((acc, d) => {
    acc[d.category] = (acc[d.category] ?? 0) + 1;
    return acc;
  }, {});
  const categoryItems = Object.entries(categoryCounts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const flagSegments: DonutSegment[] = (
    [
      { label: "Standard", value: documents.length - confidential, tone: "sky" },
      { label: "Confidential", value: confidential, tone: "rose" },
    ] as DonutSegment[]
  ).filter((s) => s.value > 0);

  return (
    <div>
      <PageHeader
        title="Document Approvals"
        subtitle="Recently uploaded documents awaiting HR review."
        action={{ label: "All documents", href: "/hr/documents" }}
      />

      <div className="card mb-5 flex flex-wrap items-center gap-3 border-sky-200 bg-sky-50 px-4 py-3">
        <Badge tone="blue">READ ONLY</Badge>
        <span className="text-sm text-sky-900">
          Review and manage files in the Documents module — this is an oversight view.
        </span>
        <Link href="/hr/documents" className="btn-primary ml-auto !py-1.5 text-xs">
          Open Documents →
        </Link>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Awaiting review" value={documents.length} hint={`Uploaded in last ${REVIEW_WINDOW_DAYS} days`} tone="sky" />
        <StatCard label="Confidential" value={confidential} hint="Needs restricted handling" tone={confidential ? "amber" : "emerald"} />
        <StatCard label="Employees" value={employees} hint="Submitting documents" tone="indigo" />
        <StatCard label="Already expired" value={expired} hint="Renewal required" tone={expired ? "rose" : "emerald"} />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Uploads by category" subtitle="What HR is being asked to verify">
          {categoryItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Nothing awaiting review</p>
          ) : (
            <BarList items={categoryItems} tone="sky" valueFormat={(v) => String(v)} />
          )}
        </ChartPanel>

        <ChartPanel title="Handling" subtitle="Confidential versus standard files">
          {flagSegments.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No documents to review</p>
          ) : (
            <Donut
              segments={flagSegments}
              size={132}
              thickness={16}
              centerValue={documents.length}
              centerLabel="files"
            />
          )}
        </ChartPanel>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents awaiting review"
          hint={`Documents uploaded in the last ${REVIEW_WINDOW_DAYS} days will appear here.`}
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Employee</th>
              <th className="th">Document</th>
              <th className="th">Category</th>
              <th className="th">Uploaded</th>
              <th className="th">Expiry</th>
              <th className="th">Handling</th>
              <th className="th text-right">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documents.map((d) => (
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
                    <span className={isPast(d.expiryDate) ? "font-medium text-rose-600" : "text-slate-600"}>
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
                    <Badge tone="slate">Standard</Badge>
                  )}
                </td>
                <td className="td text-right">
                  <Link href="/hr/documents" className="text-xs font-medium text-sky-600 hover:underline">
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
