import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { PageHeader, StatCard, Badge } from "@/components/ui";
import SettingsEditor, { type SettingDto } from "../settings-editor";

export const dynamic = "force-dynamic";

export default async function OrgPayrollSettingsPage() {
  const { organisationId } = await orgContext();

  const rows = await prisma.orgSetting.findMany({
    where: { organisationId, group: "payroll" },
    orderBy: { key: "asc" },
  });

  const settings: SettingDto[] = rows.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    value: s.value,
    dataType: s.dataType,
    isSecret: s.isSecret,
  }));

  const superRate = rows.find((r) => r.key === "super_rate")?.value;

  return (
    <div>
      <PageHeader
        title="Payroll Settings"
        subtitle="Super, PAYG, pay day and payslip defaults used when building pay runs"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Payroll settings" value={settings.length} hint="Group: payroll" tone="indigo" />
        <StatCard label="Super rate" value={superRate ? `${superRate}%` : "—"} hint="Default %" tone="emerald" />
        <StatCard label="Toggles" value={settings.filter((s) => s.dataType === "boolean").length} hint="Boolean switches" tone="amber" />
        <StatCard label="Secrets" value={settings.filter((s) => s.isSecret).length} hint="Masked values" tone="sky" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone="green">PAYROLL</Badge>
        <span>
          Values here feed new pay runs only — historical payslips keep the values they were
          generated with.
        </span>
      </div>

      <SettingsEditor settings={settings} group="payroll" />
    </div>
  );
}
