import { orgContext } from "@/lib/org";
import { PageHeader, Badge, StatCard } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function OrgProfilePage() {
  const { org } = await orgContext();

  return (
    <div>
      <PageHeader
        title="Organisation Profile"
        subtitle="Core details shown on payslips, reports and invoices"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Employees" value={org.employeeCount} hint="Maintained by sync" tone="indigo" />
        <StatCard
          label="Status"
          value={org.status}
          hint={org.status === "ACTIVE" ? "In good standing" : "Contact support"}
          tone={org.status === "ACTIVE" ? "emerald" : "rose"}
        />
        <StatCard label="Industry" value={org.industry ?? "—"} hint="Sector" tone="sky" />
        <StatCard label="Created" value={formatDate(org.createdAt)} hint="Tenant since" tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProfileForm
            initial={{
              name: org.name,
              abn: org.abn ?? "",
              email: org.email ?? "",
              phone: org.phone ?? "",
              addressLine1: org.addressLine1 ?? "",
              city: org.city ?? "",
              state: org.state ?? "",
              postcode: org.postcode ?? "",
              industry: org.industry ?? "",
            }}
          />
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-800">Record details</h2>
            <dl className="mt-3 space-y-3 text-xs">
              {[
                ["Slug", <code key="slug">{org.slug}</code>],
                [
                  "Status",
                  <Badge key="status" tone={org.status === "ACTIVE" ? "green" : "red"}>
                    {org.status}
                  </Badge>,
                ],
                ["Created", formatDate(org.createdAt)],
                ["Last updated", formatDateTime(new Date())],
                ["Employee count", `${org.employeeCount} (read-only, maintained by HR data sync)`],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-start justify-between gap-3">
                  <dt className="text-slate-400">{label as string}</dt>
                  <dd className="text-right font-medium text-slate-700">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-800">Tenant scope</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Every record in this console — employees, payroll, leave, integrations and settings —
              is scoped to organisation id{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                {org.id}
              </code>
              . Platform (super admin) accounts never appear here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
