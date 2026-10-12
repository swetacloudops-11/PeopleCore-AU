import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { PageHeader, StatCard, Badge, TableWrap, EmptyState } from "@/components/ui";
import SettingsForm, { type SettingRow } from "../SettingsForm";

export default async function HrLeaveRulesPage() {
  const { organisationId } = await hrContext();

  const [rules, settings, types] = await Promise.all([
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

  const ruleRows: SettingRow[] = rules.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.name,
    value: r.value,
    dataType: r.dataType,
    description: r.description,
    unit: r.unit,
    entity: "leaveRule",
    enabled: r.isEnabled,
  }));

  const settingRows: SettingRow[] = settings.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    value: s.value,
    dataType: s.dataType,
    isSecret: s.isSecret,
    entity: "setting",
  }));

  const enabled = ruleRows.filter((r) => r.enabled).length;
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
          value={ruleRows.length}
          hint={`${enabled} enabled · ${ruleRows.length - enabled} disabled`}
          tone="sky"
        />
        <StatCard label="Leave types" value={types.length} hint={`${paid} paid`} tone="emerald" />
        <StatCard label="Policy settings" value={settingRows.length} hint="Group: leave" tone="indigo" />
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
          <span className="text-xs text-slate-400">Edit values inline — changes audit automatically</span>
        </div>
        <SettingsForm settings={ruleRows} group="leave" allowAdd={false} />
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Leave policy settings</h2>
          <Badge tone="blue">ORGSETTING · LEAVE</Badge>
        </div>
        <SettingsForm settings={settingRows} group="leave" />
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Leave type defaults</h2>
          <Badge tone="green">LEAVETYPE</Badge>
          <span className="text-xs text-slate-400">Accrual, paid status and availability</span>
        </div>
        {types.length === 0 ? (
          <EmptyState
            title="No leave types configured"
            hint="Create leave types to make them available to staff."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Leave type</th>
                <th className="th">Code</th>
                <th className="th">Unit</th>
                <th className="th">Paid</th>
                <th className="th">Approval</th>
                <th className="th">Accrual rate</th>
                <th className="th">Max carry-over</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {types.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.colour }} />
                      {t.name}
                    </span>
                  </td>
                  <td className="td">
                    <code className="text-xs text-slate-500">{t.code}</code>
                  </td>
                  <td className="td text-slate-600">{t.unit}</td>
                  <td className="td">
                    <Badge tone={t.isPaid ? "green" : "slate"}>{t.isPaid ? "PAID" : "UNPAID"}</Badge>
                  </td>
                  <td className="td">
                    <Badge tone={t.requiresApproval ? "amber" : "slate"}>
                      {t.requiresApproval ? "REQUIRED" : "AUTO"}
                    </Badge>
                  </td>
                  <td className="td tabular-nums text-slate-600">{Number(t.accrualRate)}</td>
                  <td className="td tabular-nums text-slate-600">{Number(t.maxCarryOver)}</td>
                  <td className="td">
                    <Badge tone={t.isActive ? "green" : "slate"}>
                      {t.isActive ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}
