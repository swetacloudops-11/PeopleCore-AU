import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { PageHeader, StatCard, Badge, TableWrap, EmptyState } from "@/components/ui";
import SettingsForm, { type SettingRow } from "../SettingsForm";

export default async function HrOnboardingSettingsPage() {
  const { organisationId } = await hrContext();

  const [rows, checklists, taskCount] = await Promise.all([
    // Onboarding preferences live in the "hr" group with onboarding/probation keys.
    prisma.orgSetting.findMany({
      where: {
        organisationId,
        group: "hr",
        OR: [
          { key: { contains: "onboard" } },
          { key: { contains: "probation" } },
          { key: { contains: "starter" } },
        ],
      },
      orderBy: { key: "asc" },
    }),
    prisma.onboardingChecklist.findMany({
      where: { organisationId },
      include: { _count: { select: { tasks: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.onboardingTask.count({ where: { organisationId, stage: "ONBOARDING" } }),
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

  const defaults = checklists.filter((c) => c.isDefault).length;
  const toggles = settings.filter((s) => s.dataType === "boolean").length;

  return (
    <div>
      <PageHeader
        title="Onboarding Settings"
        subtitle="Defaults for new starters, probation reviews and the checklists that drive onboarding"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Onboarding settings" value={settings.length} hint="Group: hr" tone="sky" />
        <StatCard label="Checklists" value={checklists.length} hint={`${defaults} default`} tone="indigo" />
        <StatCard label="Onboarding tasks" value={taskCount} hint="Across all checklists" tone="emerald" />
        <StatCard label="Toggles" value={toggles} hint="Boolean preferences" tone="amber" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone="blue">HR</Badge>
        <span>
          Onboarding and probation preferences are stored in the <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">hr</code> group.
        </span>
      </div>

      <SettingsForm settings={settings} group="hr" />

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Onboarding checklists</h2>
          <Badge tone="purple">CHECKLIST</Badge>
        </div>
        {checklists.length === 0 ? (
          <EmptyState
            title="No onboarding checklists yet"
            hint="Create a checklist to define the tasks every new starter completes."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Checklist</th>
                <th className="th">Role category</th>
                <th className="th">Tasks</th>
                <th className="th">Default</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {checklists.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">{c.name}</div>
                    {c.description && (
                      <div className="max-w-md truncate text-[11px] text-slate-400">
                        {c.description}
                      </div>
                    )}
                  </td>
                  <td className="td text-slate-600">{c.roleCategory ?? "—"}</td>
                  <td className="td tabular-nums text-slate-700">{c._count.tasks}</td>
                  <td className="td">
                    {c.isDefault ? <Badge tone="blue">DEFAULT</Badge> : <span className="text-slate-400">—</span>}
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
