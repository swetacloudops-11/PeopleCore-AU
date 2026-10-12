import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, daysUntil } from "@/lib/format";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const EXPIRING_WINDOW_DAYS = 60;

const REQUIRED_CATEGORIES = ["Contract", "Identification", "Tax", "Police Check"];

export default async function RequiredDocumentsPage() {
  const { employee, organisationId } = await employeeContext();
  const today = D(0);

  const docs = await prisma.employeeDocument.findMany({
    where: { employeeId: employee.id, organisationId },
    orderBy: { createdAt: "desc" },
  });

  const withExpiry = docs.filter((d) => d.expiryDate);
  const expiringSoon = withExpiry.filter(
    (d) => d.expiryDate !== null && d.expiryDate >= today && d.expiryDate <= D(EXPIRING_WINDOW_DAYS)
  ).length;

  const requiredCards = REQUIRED_CATEGORIES.map((cat) => ({
    category: cat,
    matching: docs.filter((d) => d.category === cat),
  }));
  const satisfied = requiredCards.filter((c) => c.matching.length > 0).length;

  return (
    <div>
      <PageHeader
        title="Required documents"
        subtitle="Documents your employer needs from you during onboarding"
        action={{ label: "Upload a document", href: "/employee/documents/upload" }}
      />

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Required"
          value={REQUIRED_CATEGORIES.length}
          hint="Document categories"
          tone="indigo"
        />
        <StatCard
          label="Provided"
          value={satisfied}
          hint="Categories on file"
          tone={satisfied === REQUIRED_CATEGORIES.length ? "emerald" : "amber"}
        />
        <StatCard
          label="Missing"
          value={REQUIRED_CATEGORIES.length - satisfied}
          hint="Still owed to HR"
          tone={satisfied === REQUIRED_CATEGORIES.length ? "emerald" : "rose"}
        />
        <StatCard
          label="Expiring soon"
          value={expiringSoon}
          hint={`Within ${EXPIRING_WINDOW_DAYS} days`}
          tone={expiringSoon ? "amber" : "emerald"}
        />
      </div>

      {/* ── Required category cards ── */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {requiredCards.map((c) => {
          const ok = c.matching.length > 0;
          return (
            <article
              key={c.category}
              className={`card border-l-4 p-5 ${ok ? "border-l-emerald-400" : "border-l-amber-400"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">{c.category}</h2>
                <Badge tone={ok ? "green" : "amber"}>{ok ? "Provided" : "Missing"}</Badge>
              </div>
              {ok ? (
                <ul className="mt-2 space-y-1">
                  {c.matching.map((d) => (
                    <li key={d.id} className="text-[13px] text-slate-600">
                      ✓ {d.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2">
                  <p className="text-[13px] text-slate-500">
                    HR still needs a document in this category before your onboarding can finish.
                  </p>
                  <Link
                    href="/employee/documents/upload"
                    className="btn-primary mt-3 inline-block !py-1.5 text-xs"
                  >
                    Upload {c.category.toLowerCase()} document
                  </Link>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* ── Documents with expiry dates ── */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Documents with expiry dates</h2>
        {withExpiry.length === 0 ? (
          <EmptyState
            title="No expiring documents"
            hint="None of your documents have an expiry date on record."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Title</th>
                <th className="th">Category</th>
                <th className="th">File name</th>
                <th className="th">Expires</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {withExpiry.map((d) => {
                const days = d.expiryDate ? daysUntil(d.expiryDate) : 0;
                const tone = days < 0 ? "red" : days <= EXPIRING_WINDOW_DAYS ? "amber" : "slate";
                const label =
                  days < 0
                    ? "Expired"
                    : days <= EXPIRING_WINDOW_DAYS
                    ? `Expires in ${days}d`
                    : "Current";
                return (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">{d.title}</td>
                    <td className="td">
                      <Badge tone="purple">{d.category}</Badge>
                    </td>
                    <td className="td max-w-[220px] truncate text-slate-500">{d.fileName}</td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {d.expiryDate ? formatDate(d.expiryDate) : "—"}
                    </td>
                    <td className="td">
                      <Badge tone={tone}>{label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
