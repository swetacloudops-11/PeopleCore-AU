import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import SettingField from "./SettingField";

export const dynamic = "force-dynamic";

const GROUP_META: Record<string, { label: string; icon: string; desc: string }> = {
  general: { label: "General", icon: "🌐", desc: "Core platform identity and regional defaults" },
  branding: { label: "Branding", icon: "🎨", desc: "Visual appearance of the console" },
  security: { label: "Security", icon: "🔐", desc: "Authentication and session policies" },
  integrations: { label: "Integrations", icon: "🔌", desc: "Connector timeouts and secrets" },
  billing: { label: "Billing", icon: "💳", desc: "Currency, tax and invoicing defaults" },
};

export default async function GlobalSettingsPage() {
  const settings = await prisma.globalSetting.findMany({
    orderBy: [{ group: "asc" }, { key: "asc" }],
  });

  const grouped = settings.reduce<Record<string, typeof settings>>((acc, s) => {
    (acc[s.group] ??= []).push(s);
    return acc;
  }, {});

  const secretCount = settings.filter((s) => s.isSecret).length;

  return (
    <div>
      <PageHeader
        title="Global Settings"
        subtitle={`${settings.length} platform settings · ${secretCount} securely stored`}
      />

      <div className="space-y-7">
        {Object.entries(grouped).map(([group, items]) => {
          const meta = GROUP_META[group] ?? { label: group, icon: "⚙️", desc: "" };
          return (
            <section key={group}>
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                <span>{meta.icon}</span>
                {meta.label}
              </h2>
              <p className="mb-3 text-xs text-slate-400">{meta.desc}</p>

              <div className="card divide-y divide-slate-100">
                {items.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center gap-4 px-4 py-3.5 sm:px-5"
                  >
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{s.label}</span>
                        {s.isSecret && <Badge tone="amber">SECRET</Badge>}
                      </div>
                      <code className="mt-0.5 block text-[11px] text-slate-400">{s.key}</code>
                    </div>

                    <div className="w-full sm:w-80">
                      <SettingField
                        id={s.id}
                        value={s.value}
                        dataType={s.dataType}
                        isSecret={s.isSecret}
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
