import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge, StatCard, EmptyState, PageHeader } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment } from "@/components/charts";
import { formatDate } from "@/lib/format";

/** Badge tones (separate from chart tones). */
const ACK_TONE: Record<string, string> = {
  ACKNOWLEDGED: "green",
  PENDING: "amber",
  OVERDUE: "red",
  WAIVED: "slate",
};

export default async function CompanyPoliciesPage() {
  const { employee, organisationId } = await employeeContext();

  const [policies, acks] = await Promise.all([
    prisma.policy.findMany({
      where: { organisationId },
      orderBy: { title: "asc" },
    }),
    prisma.policyAcknowledgement.findMany({
      where: { organisationId, employeeId: employee.id },
    }),
  ]);

  const ackByPolicy = new Map(acks.map((a) => [a.policyId, a]));
  const statusCount = (status: string) => acks.filter((a) => a.status === status).length;
  const acknowledged = statusCount("ACKNOWLEDGED");
  const outstanding = statusCount("PENDING") + statusCount("OVERDUE");
  const mandatory = policies.filter((p) => p.isMandatory).length;

  const segments = ([
    { label: "Acknowledged", value: acknowledged, tone: "emerald" },
    { label: "Pending", value: statusCount("PENDING"), tone: "amber" },
    { label: "Overdue", value: statusCount("OVERDUE"), tone: "rose" },
    { label: "Waived", value: statusCount("WAIVED"), tone: "slate" },
  ] as DonutSegment[]).filter((s) => s.value > 0);

  return (
    <div>
      <PageHeader
        title="Company policies"
        subtitle={`Policies published by your organisation · ${policies.length} total`}
        action={{ label: "My acknowledgements", href: "/employee/policies/acknowledgements" }}
      />

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Policies" value={policies.length} hint="Published for your org" tone="indigo" />
        <StatCard
          label="Acknowledged"
          value={acknowledged}
          hint="Signed off by you"
          tone="emerald"
        />
        <StatCard
          label="Outstanding"
          value={outstanding}
          hint="Waiting on your response"
          tone={outstanding > 0 ? "amber" : "emerald"}
        />
        <StatCard label="Mandatory" value={mandatory} hint="Must be acknowledged" tone="sky" />
      </div>

      {/* ── Acknowledgement mix ── */}
      {acks.length > 0 && (
        <div className="mt-5">
          <ChartPanel title="Your acknowledgements" subtitle="Status across assigned policies">
            <Donut
              segments={segments}
              size={140}
              thickness={16}
              centerValue={acks.length}
              centerLabel="assigned"
            />
          </ChartPanel>
        </div>
      )}

      {/* ── Policy cards ── */}
      <div className="mt-6">
        {policies.length === 0 ? (
          <EmptyState
            title="No policies published yet"
            hint="When your organisation publishes policies they will appear here."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {policies.map((p) => {
              const ack = ackByPolicy.get(p.id);
              const status = ack?.status ?? null;
              return (
                <article key={p.id} className="card flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-slate-900">{p.title}</h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {p.category} · v{p.version} · effective {formatDate(p.effectiveDate)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {p.isMandatory && <Badge tone="red">Mandatory</Badge>}
                      <Badge tone={ACK_TONE[status ?? "NONE"] ?? "slate"}>
                        {status ? status.replace(/_/g, " ") : "Not issued"}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-3 flex-1 text-[13px] leading-relaxed text-slate-600">
                    {p.content.length > 220
                      ? `${p.content.slice(0, 220).trimEnd()}…`
                      : p.content}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
