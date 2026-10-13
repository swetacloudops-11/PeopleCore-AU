import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { formatDate } from "@/lib/format";

const STATUS_TONE: Record<string, string> = {
  CONNECTED: "green",
  DISCONNECTED: "slate",
  ERROR: "red",
  PENDING: "amber",
};

/** Safe key extraction from the mapping's arbitrary JSON config blob. */
function configKeys(config: unknown): string[] {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    return Object.keys(config as Record<string, unknown>);
  }
  return [];
}

/** Static reference: how PeopleCore AU fields land in a payroll provider. */
const FIELD_MAP = [
  {
    source: "Employee",
    target: "Payroll contact",
    note: "Employee profile ↔ payroll contact, matched by employee number.",
  },
  {
    source: "Pay category",
    target: "Earnings rate",
    note: "Pay categories ↔ earnings rates / ordinary, overtime and allowance codes.",
  },
  {
    source: "Pay run",
    target: "Pay period",
    note: "Pay runs ↔ payroll pay periods, driven by the pay schedule frequency.",
  },
  {
    source: "Superannuation",
    target: "Super fund",
    note: "Super records ↔ the destination super fund and member number.",
  },
];

export default async function PayrollIntegrationMappingPage() {
  const { organisationId, org } = await payrollContext();

  const mappings = await prisma.organisationIntegration.findMany({
    where: { organisationId, status: "CONNECTED" },
    include: { integration: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Integration Mapping"
        subtitle={`How ${org.name} maps onto its connected payroll providers`}
      />

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Connected mappings</h2>
          <span className="text-xs text-slate-400">
            {mappings.length} connected integration{mappings.length === 1 ? "" : "s"}
          </span>
        </div>

        {mappings.length === 0 ? (
          <EmptyState
            title="No connected integrations to map"
            hint="Connect a payroll provider from the Connected Integrations page to see its mapping details."
          />
        ) : (
          <div className="space-y-3">
            {mappings.map((m) => {
              const keys = configKeys(m.config);
              return (
                <details key={m.id} className="card overflow-hidden p-0">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {m.integration.name}
                        </span>
                        <Badge tone={STATUS_TONE[m.status] ?? "slate"}>{m.status}</Badge>
                        <Badge tone={m.integration.category === "PAYROLL" ? "amber" : "slate"}>
                          {m.integration.category}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">{m.integration.provider}</div>
                    </div>
                    <span className="text-xs text-slate-400">Details ▾</span>
                  </summary>

                  <div className="grid gap-4 border-t border-slate-100 px-4 py-4 sm:grid-cols-2">
                    <dl className="space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-500">External account id</dt>
                        <dd className="text-right font-medium text-slate-700">
                          {m.externalAccountId ?? <span className="text-slate-400">Not set</span>}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-500">External account name</dt>
                        <dd className="text-right text-slate-700">
                          {m.externalAccountName ?? <span className="text-slate-400">—</span>}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-500">Connected</dt>
                        <dd className="text-right text-slate-700">
                          {m.connectedAt ? formatDate(m.connectedAt) : <span className="text-slate-400">—</span>}
                        </dd>
                      </div>
                    </dl>

                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="mb-1 text-slate-500">Scopes</div>
                        {m.scopes.length === 0 ? (
                          <span className="text-slate-400">No scopes granted</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {m.scopes.map((s) => (
                              <span
                                key={s}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="mb-1 text-slate-500">Config keys</div>
                        {keys.length === 0 ? (
                          <span className="text-slate-400">None stored</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {keys.map((k) => (
                              <span
                                key={k}
                                className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {!m.externalAccountId && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700 sm:col-span-2">
                        No external account id is set for this connection. Assign the matching
                        payroll account before the next sync so records land in the right place.
                      </p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2">
          <h2 className="text-sm font-semibold text-slate-800">Payroll field mapping</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Static reference — how PeopleCore AU fields map to a payroll provider.
          </p>
        </div>
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">PeopleCore AU</th>
              <th className="th">Payroll provider</th>
              <th className="th">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {FIELD_MAP.map((row) => (
              <tr key={row.source} className="hover:bg-slate-50/70">
                <td className="td font-medium text-slate-800">{row.source}</td>
                <td className="td">
                  <Badge tone="amber">{row.target}</Badge>
                </td>
                <td className="td text-slate-500">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>
    </div>
  );
}
