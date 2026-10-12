import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { PageHeader, StatCard, Badge } from "@/components/ui";
import SettingsEditor, { type SettingDto } from "../settings-editor";
import LeaveRuleList, { type LeaveRuleDto } from "../leave-rule-list";
import LeaveTypeList, { type LeaveTypeDto } from "../leave-type-list";

export const dynamic = "force-dynamic";

export default async function OrgLeaveRulesPage() {
  const { organisationId } = await orgContext();

  const [ruleRows, settingRows, typeRows] = await Promise.all([
    prisma.leaveRule.findMany({
      where: { organisationId },
      orderBy: { key: "asc" },
    }),
    // Leave policy settings live under the "leave" group when seeded.
    prisma.orgSetting.findMany({
      where: { organisationId, group: "leave" },
      orderBy: { key: "asc" },
    }),
    prisma.leaveType.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
    }),
  ]);

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

  const settings: SettingDto[] = settingRows.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    value: s.value,
    dataType: s.dataType,
    isSecret: s.isSecret,
  }));

  // Decimals must be converted before they reach any client component.
  const types: LeaveTypeDto[] = typeRows.map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    unit: t.unit,
    accrualRate: Number(t.accrualRate),
    maxCarryOver: Number(t.maxCarryOver),
    isPaid: t.isPaid,
    requiresApproval: t.requiresApproval,
    colour: t.colour,
    isActive: t.isActive,
  }));

  const enabled = rules.filter((r) => r.isEnabled).length;
  const paid = types.filter((t) => t.isPaid).length;

  return (
    <div>
      <PageHeader
        title="Leave Rules"
        subtitle="Carry-over limits, notice periods, accruals and the leave types available to staff"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Leave rules"
          value={rules.length}
          hint={`${enabled} enabled · ${rules.length - enabled} disabled`}
          tone="indigo"
        />
        <StatCard label="Leave types" value={types.length} hint={`${paid} paid`} tone="emerald" />
        <StatCard label="Policy settings" value={settings.length} hint="Group: leave" tone="sky" />
        <StatCard
          label="Inactive types"
          value={types.filter((t) => !t.isActive).length}
          hint="Hidden from staff"
          tone="amber"
        />
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Leave rules</h2>
          <Badge tone="purple">LEAVERULE</Badge>
          <span className="text-xs text-slate-400">Edit values and toggle rules on or off</span>
        </div>
        <LeaveRuleList rules={rules} />
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Leave policy settings</h2>
          <Badge tone="blue">ORGSETTING · LEAVE</Badge>
        </div>
        <SettingsEditor settings={settings} group="leave" />
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Leave types</h2>
          <Badge tone="green">LEAVETYPE</Badge>
          <span className="text-xs text-slate-400">Accrual, paid status, colour and availability</span>
        </div>
        <LeaveTypeList types={types} />
      </section>
    </div>
  );
}
