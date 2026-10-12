import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { formatDate, daysFromNow } from "@/lib/format";
import DocumentUploadForm from "./DocumentUploadForm";

const DEFAULT_CATEGORIES = [
  "Contract",
  "Tax",
  "Right to work",
  "Certification",
  "Policy",
  "Performance",
  "Other",
];

export default async function UploadDocumentsPage() {
  const { organisationId } = await hrContext();

  const [employees, distinctCats, recent, totalDocs, confidential, expiring] =
    await Promise.all([
      prisma.employee.findMany({
        where: { organisationId },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      }),
      prisma.employeeDocument.findMany({
        where: { organisationId },
        distinct: ["category"],
        select: { category: true },
        orderBy: { category: "asc" },
      }),
      prisma.employeeDocument.findMany({
        where: { organisationId },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.employeeDocument.count({ where: { organisationId } }),
      prisma.employeeDocument.count({ where: { organisationId, isConfidential: true } }),
      prisma.employeeDocument.count({
        where: {
          organisationId,
          expiryDate: { gte: daysFromNow(0), lte: daysFromNow(60) },
        },
      }),
    ]);

  const categories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...distinctCats.map((c) => c.category)])
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Upload documents
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Record document metadata against an employee. Files are not stored — only the
            name, type and size are kept.
          </p>
        </div>
        <Link href="/hr/documents" className="btn-secondary">
          ← All documents
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Documents" value={totalDocs} hint="On record" tone="sky" />
        <StatCard label="Confidential" value={confidential} hint="Restricted access" tone="amber" />
        <StatCard label="Expiring soon" value={expiring} hint="Within 60 days" tone={expiring ? "amber" : "emerald"} />
        <StatCard label="Employees" value={employees.length} hint="Available to attach" tone="indigo" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        <section className="card p-4 sm:p-5 lg:col-span-3">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Document details</h2>
          <DocumentUploadForm
            employees={employees.map((e) => ({
              id: e.id,
              name: `${e.firstName} ${e.lastName} (${e.employeeNumber})`,
            }))}
            categories={categories}
          />
        </section>

        <aside className="lg:col-span-2">
          <div className="card p-4 text-sm text-slate-600 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-800">How this works</h2>
            <ul className="mt-3 space-y-2 text-[13px]">
              <li className="flex gap-2">
                <span className="text-sky-500">•</span>
                Pick the employee the document belongs to.
              </li>
              <li className="flex gap-2">
                <span className="text-sky-500">•</span>
                Choose a file to capture its name, type and size — the bytes are never read or sent.
              </li>
              <li className="flex gap-2">
                <span className="text-sky-500">•</span>
                Add an expiry date to surface the document in expiry tracking.
              </li>
              <li className="flex gap-2">
                <span className="text-sky-500">•</span>
                Mark confidential records to restrict who can see them.
              </li>
            </ul>
          </div>
        </aside>
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Recently recorded</h2>
          <Link href="/hr/documents" className="text-xs text-sky-600 hover:underline">
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            title="No documents recorded yet"
            hint="Use the form above to record the first document."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Title</th>
                <th className="th">Category</th>
                <th className="th">Recorded</th>
                <th className="th">Expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <Link
                      href={`/hr/employees/${d.employee.id}`}
                      className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                    >
                      {d.employee.firstName} {d.employee.lastName}
                    </Link>
                  </td>
                  <td className="td text-slate-700">{d.title}</td>
                  <td className="td">
                    <Badge tone="blue">{d.category}</Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{formatDate(d.createdAt)}</td>
                  <td className="td whitespace-nowrap text-slate-500">{formatDate(d.expiryDate)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}
