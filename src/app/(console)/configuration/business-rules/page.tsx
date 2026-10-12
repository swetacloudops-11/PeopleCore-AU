import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import ToggleRow from "./ToggleRow";

export const dynamic = "force-dynamic";

export default async function BusinessRulesPage() {
  const rules = await prisma.businessRule.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] });

  const grouped = rules.reduce<Record<string, typeof rules>>((acc, r) => {
    (acc[r.module] ??= []).push(r);
    return acc;
  }, {});

  const MODULE_META: Record<string, { label: string; icon: string }> = {
    general: { label: "General", icon: "🌐" },
    people: { label: "People & Leave", icon: "👥" },
    payroll: { label: "Payroll", icon: "💸" },
    billing: { label: "Billing", icon: "💳" },
    security: { label: "Security", icon: "🔐" },
    compliance: { label: "Compliance", icon: "📜" },
    integrations: { label: "Integrations", icon: "🔌" },
  };

  return (
    <div>
      <PageHeader
        title="Business Rules"
        subtitle="Platform-wide rules that govern how PeopleCore behaves for every organisation"
      />

      <div className="space-y-7">
        {Object.entries(grouped).map(([mod, items]) => {
          const meta = MODULE_META[mod] ?? { label: mod, icon: "⚙️" };
          return (
            <section key={mod}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                <span>{meta.icon}</span>
                {meta.label}
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {items.length}
                </span>
              </h2>

              <div className="card divide-y divide-slate-100">
                {items.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5"
                  >
                    <div className="min-w-[240px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{r.name}</span>
                        {r.unit && <Badge tone="slate">{r.unit}</Badge>}
                        {r.isReadOnly && <Badge tone="amber">READ ONLY</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{r.description}</p>
                      <code className="mt-1 block text-[11px] text-slate-400">{r.key}</code>
                    </div>

                    <div className="w-full sm:w-56">
                      <ToggleRow
                        id={r.id}
                        dataType={r.dataType}
                        initialValue={r.value}
                        enabled={r.isEnabled}
                        readOnly={r.isReadOnly}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
