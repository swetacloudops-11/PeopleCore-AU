import { prisma } from "@/lib/prisma";
import { Badge, EmptyState } from "@/components/ui";
import IntegrationManager from "@/components/IntegrationManager";
import IntegrationRowActions from "@/components/IntegrationRowActions";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  ACCOUNTING: "Accounting",
  BANKING: "Banking",
  PAYROLL: "Payroll",
  HRIS: "HRIS",
  IDENTITY: "Identity",
  CUSTOM: "Custom API",
};

const CATEGORY_ICON: Record<string, string> = {
  ACCOUNTING: "🧾",
  BANKING: "🏦",
  PAYROLL: "💸",
  HRIS: "🗂️",
  IDENTITY: "🔑",
  CUSTOM: "🔌",
};

export default async function IntegrationsPage() {
  const integrations = await prisma.integration.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    include: {
      _count: { select: { mappings: true } },
      mappings: { select: { status: true } },
    },
  });

  const grouped = integrations.reduce<Record<string, typeof integrations>>(
    (acc, i) => {
      (acc[i.category] ??= []).push(i);
      return acc;
    },
    {}
  );

  const totalMappings = integrations.reduce((a, i) => a + i._count.mappings, 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            All Integrations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {integrations.length} available connectors · {totalMappings} organisation mappings
          </p>
        </div>
        <IntegrationManager showCreate />
      </div>

      {integrations.length === 0 ? (
        <EmptyState title="No integrations registered" />
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <section key={cat} className="mb-7">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <span>{CATEGORY_ICON[cat]}</span>
              {CATEGORY_LABEL[cat] ?? cat}
              <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {items.length}
              </span>
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((it) => {
                const connected = it.mappings.filter((m) => m.status === "CONNECTED").length;
                const errored = it.mappings.filter((m) => m.status === "ERROR").length;
                const tone =
                  it.status === "ACTIVE" ? "green" : it.status === "MAINTENANCE" ? "amber" : "slate";
                return (
                  <div key={it.id} className="card flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg">
                          {CATEGORY_ICON[cat]}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-slate-900">{it.name}</h3>
                            {it.isOfficial && (
                              <Badge tone="purple">OFFICIAL</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">by {it.provider}</p>
                        </div>
                      </div>
                      <Badge tone={tone}>{it.status}</Badge>
                    </div>

                    <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-500">
                      {it.description ?? "No description provided."}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                      <span className="text-slate-500">
                        <strong className="text-slate-700">{connected}</strong> connected
                        {errored > 0 && (
                          <span className="ml-2 text-rose-600">
                            {errored} error{errored === 1 ? "" : "s"}
                          </span>
                        )}
                      </span>
                      <span className="text-slate-400">{it._count.mappings} mapped</span>
                    </div>

                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <IntegrationRowActions
                        integration={{
                          id: it.id,
                          key: it.key,
                          name: it.name,
                          provider: it.provider,
                          category: it.category,
                          description: it.description,
                          websiteUrl: it.websiteUrl,
                          docsUrl: it.docsUrl,
                          isOfficial: it.isOfficial,
                          status: it.status,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
