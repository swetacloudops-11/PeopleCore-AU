import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { PageHeader, StatCard, Badge } from "@/components/ui";
import { daysFromNow } from "@/lib/format";
import SettingsForm, { type SettingRow } from "../SettingsForm";

const EXPIRY_WINDOW_DAYS = 60;

export default async function HrDocumentSettingsPage() {
  const { organisationId } = await hrContext();

  const [rows, totalDocuments, confidential, expiringSoon, categories] = await Promise.all([
    prisma.orgSetting.findMany({
      where: { organisationId, group: "documents" },
      orderBy: { key: "asc" },
    }),
    prisma.employeeDocument.count({ where: { organisationId } }),
    prisma.employeeDocument.count({ where: { organisationId, isConfidential: true } }),
    prisma.employeeDocument.count({
      where: {
        organisationId,
        expiryDate: { gte: daysFromNow(0), lte: daysFromNow(EXPIRY_WINDOW_DAYS) },
      },
    }),
    prisma.employeeDocument.groupBy({
      by: ["category"],
      where: { organisationId },
      _count: { _all: true },
    }),
  ]);

  const settings: SettingRow[] = rows.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    value: s.value,
    dataType: s.dataType,
    isSecret: s.isSecret,
    entity: "setting",
  }));

  const numbers = settings.filter((s) => s.dataType === "number").length;

  return (
    <div>
      <PageHeader
        title="Document Settings"
        subtitle="Retention periods, expiry alert lead times and how employee documents are handled"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Document settings" value={settings.length} hint="Group: documents" tone="sky" />
        <StatCard label="Employee documents" value={totalDocuments} hint={`${categories.length} categories`} tone="indigo" />
        <StatCard
          label="Expiring soon"
          value={expiringSoon}
          hint={`Next ${EXPIRY_WINDOW_DAYS} days`}
          tone={expiringSoon ? "amber" : "emerald"}
        />
        <StatCard
          label="Confidential"
          value={confidential}
          hint="Restricted access"
          tone={confidential ? "rose" : "emerald"}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone="blue">DOCUMENTS</Badge>
        <span>
          {numbers} numeric rule{numbers === 1 ? "" : "s"} control retention and alerting.{" "}
          <Link href="/hr/documents/expiry" className="text-sky-600 hover:underline">
            Review expiring documents →
          </Link>
        </span>
      </div>

      <SettingsForm settings={settings} group="documents" />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Document categories</h2>
        {categories.length === 0 ? (
          <div className="card px-4 py-8 text-center text-sm text-slate-500">
            No employee documents have been uploaded yet.
          </div>
        ) : (
          <div className="card p-4">
            <ul className="space-y-2.5">
              {[...categories]
                .sort((a, b) => b._count._all - a._count._all)
                .map((c) => (
                  <li key={c.category} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{c.category}</span>
                    <span className="font-medium tabular-nums text-slate-800">{c._count._all}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
