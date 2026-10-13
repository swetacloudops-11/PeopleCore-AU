import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { payrollContext } from "@/lib/payroll";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/format";
import IntegrationActions from "./IntegrationActions";

const STATUS_TONE: Record<string, string> = {
  CONNECTED: "green",
  DISCONNECTED: "slate",
  ERROR: "red",
  PENDING: "amber",
};

const CATEGORY_TONE: Record<string, string> = {
  ACCOUNTING: "purple",
  BANKING: "blue",
  PAYROLL: "amber",
  HRIS: "green",
  IDENTITY: "slate",
  CUSTOM: "blue",
};

const CATEGORY_ICON: Record<string, string> = {
  ACCOUNTING: "🧾",
  BANKING: "🏦",
  PAYROLL: "💸",
  HRIS: "🗂️",
  IDENTITY: "🔑",
  CUSTOM: "🔌",
};

const SYNC_TONE: Record<string, string> = {
  SUCCESS: "green",
  PARTIAL: "amber",
  FAILED: "red",
  RUNNING: "blue",
  SKIPPED: "slate",
};

export default async function PayrollIntegrationsPage() {
  const { organisationId, org } = await payrollContext();

  const mappings = await prisma.organisationIntegration.findMany({
    where: { organisationId },
    include: { integration: true },
    orderBy: { updatedAt: "desc" },
  });

  // Payroll-category connections lead the list, everything else follows.
  const ordered = [...mappings].sort((a, b) => {
    const aPay = a.integration.category === "PAYROLL" ? 0 : 1;
    const bPay = b.integration.category === "PAYROLL" ? 0 : 1;
    if (aPay !== bPay) return aPay - bPay;
    return a.integration.name.localeCompare(b.integration.name);
  });

  const countOf = (s: string) => mappings.filter((m) => m.status === s).length;
  const payrollConnected = mappings.filter(
    (m) => m.integration.category === "PAYROLL" && m.status === "CONNECTED"
  ).length;

  const lastSync =
    mappings
      .map((m) => m.lastSyncAt)
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return (
    <div>
      <PageHeader
        title="Connected Payroll Integrations"
        subtitle={`${mappings.length} integration${mappings.length === 1 ? "" : "s"} mapped to ${org.name}`}
        action={{ label: "Integration mapping", href: "/payroll/integrations/mapping" }}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Connected" value={countOf("CONNECTED")} hint="Actively syncing" tone="emerald" />
        <StatCard
          label="Payroll integrations"
          value={payrollConnected}
          hint="Category: payroll"
          tone="amber"
        />
        <StatCard
          label="Errored"
          value={countOf("ERROR")}
          hint="Needs attention"
          tone={countOf("ERROR") ? "rose" : "emerald"}
        />
        <StatCard
          label="Last sync"
          value={lastSync ? timeAgo(lastSync) : "Never"}
          hint={lastSync ? formatDateTime(lastSync) : "No sync recorded yet"}
          tone="sky"
        />
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          title="No integrations connected yet"
          hint="Payroll connections such as Xero Payroll, Employment Hero or KeyPay will appear here once mapped."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ordered.map((m) => (
            <div key={m.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-lg">
                    {CATEGORY_ICON[m.integration.category] ?? "🔌"}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{m.integration.name}</h3>
                      <Badge tone={CATEGORY_TONE[m.integration.category] ?? "slate"}>
                        {m.integration.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400">by {m.integration.provider}</p>
                  </div>
                </div>
                <Badge tone={STATUS_TONE[m.status] ?? "slate"}>{m.status}</Badge>
              </div>

              <dl className="mt-4 flex-1 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">External account</dt>
                  <dd className="text-right font-medium text-slate-700">
                    {m.externalAccountName ?? <span className="text-slate-400">Not set</span>}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Last sync</dt>
                  <dd className="text-right text-slate-600">
                    {m.lastSyncAt ? (
                      <>
                        {timeAgo(m.lastSyncAt)}
                        <span className="ml-1 text-slate-400">· {formatDateTime(m.lastSyncAt)}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">Never</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Last sync status</dt>
                  <dd>
                    {m.lastSyncStatus ? (
                      <Badge tone={SYNC_TONE[m.lastSyncStatus] ?? "slate"}>{m.lastSyncStatus}</Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </dd>
                </div>
              </dl>

              {m.scopes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {m.scopes.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {m.errorMessage && (
                <p className="mt-3 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-600">
                  {m.errorMessage}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <IntegrationActions
                  id={m.id}
                  integrationId={m.integrationId}
                  name={m.integration.name}
                  status={m.status}
                />
                <Link
                  href="/payroll/integrations/logs"
                  className="text-[11px] text-amber-600 hover:underline"
                >
                  Logs →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
