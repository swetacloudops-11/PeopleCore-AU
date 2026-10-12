import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { PageHeader, StatCard, Badge } from "@/components/ui";
import SettingsEditor, { type SettingDto } from "../settings-editor";
import LeaveRuleList, { type LeaveRuleDto } from "../leave-rule-list";

export const dynamic = "force-dynamic";

export default async function OrgBusinessRulesPage() {
  const { organisationId } = await orgContext();

  const [settingRows, ruleRows] = await Promise.all([
    prisma.orgSetting.findMany({
      where: { organisationId, group: "business_rules" },
      orderBy: { key: "asc" },
    }),
    prisma.leaveRule.findMany({
      where: { organisationId },
      orderBy: { key: "asc" },
    }),
  ]);

  const settings: SettingDto[] = settingRows.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    value: s.value,
    dataType: s.dataType,
    isSecret: s.isSecret,
  }));

  const rules: LeaveRuleDto[] = ruleRows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    value: r.value,
    dataType: r.dataType,
    unit: r.unit,
    isEnabled: r.isEnabled,
  }));

  const rulesEnabled = rules.filter((r) => r.isEnabled).length;
  const toggles = settingRows.filter((s) => s.dataType === "boolean").length;
  const togglesOn = settingRows.filter((s) => s.dataType === "boolean" && s.value === "true").length;

  return (
    <div>
      <PageHeader
        title="Business Rules"
        subtitle="The two rule stores that govern this organisation: OrgSetting (business_rules) and LeaveRule"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Setting rules" value={settings.length} hint="Group: business_rules" tone="indigo" />
        <StatCard label="Toggles on" value={togglesOn} hint={`${toggles - togglesOn} of ${toggles} off`} tone="emerald" />
        <StatCard
          label="Leave rules enabled"
          value={rulesEnabled}
          hint={`${rules.length - rulesEnabled} disabled`}
          tone={rulesEnabled === rules.length ? "emerald" : "amber"}
        />
        <StatCard label="Total rules" value={settings.length + rules.length} hint="Both stores" tone="sky" />
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Approval &amp; workflow rules</h2>
          <Badge tone="blue">ORGSETTING</Badge>
        </div>
        <SettingsEditor settings={settings} group="business_rules" />
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Leave &amp; rostering rules</h2>
          <Badge tone="purple">LEAVERULE</Badge>
        </div>
        <LeaveRuleList rules={rules} />
      </section>
    </div>
  );
}
