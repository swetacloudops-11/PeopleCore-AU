import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { PageHeader, StatCard, Badge } from "@/components/ui";
import SettingsForm, { type SettingRow } from "./SettingsForm";

export default async function HrSettingsPage() {
  const { organisationId } = await hrContext();

  const rows = await prisma.orgSetting.findMany({
    where: { organisationId, group: "hr" },
    orderBy: { key: "asc" },
  });

  const settings: SettingRow[] = rows.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    value: s.value,
    dataType: s.dataType,
    isSecret: s.isSecret,
    entity: "setting",
  }));

  const toggles = settings.filter((s) => s.dataType === "boolean").length;
  const enabled = settings.filter((s) => s.dataType === "boolean" && s.value === "true").length;
  const numbers = settings.filter((s) => s.dataType === "number").length;

  return (
    <div>
      <PageHeader
        title="HR Preferences"
        subtitle="Date formats, employee numbering, probation defaults and profile rules for this organisation"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="HR settings" value={settings.length} hint="Group: hr" tone="sky" />
        <StatCard label="Toggles" value={toggles} hint={`${enabled} enabled`} tone="emerald" />
        <StatCard label="Numeric" value={numbers} hint="Number values" tone="indigo" />
        <StatCard
          label="Secrets"
          value={settings.filter((s) => s.isSecret).length}
          hint="Masked values"
          tone="amber"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone="blue">HR</Badge>
        <span>
          These preferences apply to every employee record, probation review and onboarding task in
          this organisation. Changes save as you go.
        </span>
      </div>

      <SettingsForm settings={settings} group="hr" />
    </div>
  );
}
