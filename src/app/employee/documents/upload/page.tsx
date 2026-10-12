import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import DocumentUploadForm from "./DocumentUploadForm";

export default async function UploadDocumentsPage() {
  const { employee, organisationId } = await employeeContext();

  const recent = await prisma.employeeDocument.findMany({
    where: { employeeId: employee.id, organisationId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div>
      <PageHeader
        title="Upload documents"
        subtitle="Add a document to your employee file — only its name and size are recorded, the file itself never leaves your device."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Upload form ── */}
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">New document</h2>
          <DocumentUploadForm />
        </section>

        {/* ── Recent uploads ── */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-800">Your recent uploads</h2>
          <p className="mt-0.5 text-xs text-slate-400">Your 5 most recent documents</p>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Nothing uploaded yet</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {recent.map((d) => (
                <li key={d.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-slate-800">{d.title}</span>
                    <Badge tone="purple">{d.category}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    {d.fileName}
                    {d.fileSize > 0 ? ` · ${(d.fileSize / 1024).toFixed(1)} KB` : ""} ·{" "}
                    {formatDate(d.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
