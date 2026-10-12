import Link from "next/link";
import { AcknowledgementStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { BarList, ChartPanel, Donut, type BarItem, type DonutSegment } from "@/components/charts";
import { formatDate } from "@/lib/format";

const PAGE = 25;

const ACK_TONE: Record<string, string> = {
  ACKNOWLEDGED: "green",
  PENDING: "amber",
  OVERDUE: "red",
  WAIVED: "slate",
};

const CHART_TONE: Record<string, DonutSegment["tone"]> = {
  ACKNOWLEDGED: "emerald",
  PENDING: "amber",
  OVERDUE: "rose",
  WAIVED: "slate",
};

function bail(message: string): never {
  redirect(`/hr/policies/acknowledgements?error=${encodeURIComponent(message)}`);
}

/** POST target for the reminder buttons — mirrors /api/hr/policies/acknowledgements. */
async function sendReminder(formData: FormData) {
  "use server";
  const { organisationId } = await hrContext();
  const policyId = String(formData.get("policyId") ?? "").trim() || undefined;

  let title = "Policy acknowledgement reminder";
  let body = "Please review and acknowledge the outstanding company policies.";

  if (policyId) {
    const policy = await prisma.policy.findFirst({
      where: { id: policyId, organisationId },
      select: { title: true },
    });
    if (!policy) bail("Policy not found");
    const outstanding = await prisma.policyAcknowledgement.count({
      where: { organisationId, policyId, status: { in: ["PENDING", "OVERDUE"] } },
    });
    title = `Reminder: acknowledge '${policy.title}'`;
    body = `${outstanding} acknowledgement${
      outstanding === 1 ? "" : "s"
    } outstanding for '${policy.title}'.`;
  }

  await prisma.orgNotification.create({
    data: {
      organisationId,
      event: "POLICY_REMINDER",
      title,
      body,
      channel: "IN_APP",
      isRead: false,
      linkUrl: "/hr/policies/acknowledgements",
    },
  });

  revalidatePath("/hr/policies/acknowledgements");
  redirect("/hr/policies/acknowledgements?sent=1");
}

/** PATCH target for the per-row status select — mirrors the acknowledgements API. */
async function updateAcknowledgement(formData: FormData) {
  "use server";
  const { organisationId } = await hrContext();

  const id = String(formData.get("id") ?? "");
  const statusParam = String(formData.get("status") ?? "");
  const status = parseEnum(AcknowledgementStatus, statusParam);
  if (!status) bail("Unknown acknowledgement status");

  const ack = await prisma.policyAcknowledgement.findFirst({
    where: { id, organisationId },
    select: { id: true },
  });
  if (!ack) bail("Acknowledgement not found");

  await prisma.policyAcknowledgement.update({
    where: { id },
    data: {
      status,
      acknowledgedAt: status === "ACKNOWLEDGED" ? new Date() : null,
    },
  });

  revalidatePath("/hr/policies/acknowledgements");
  redirect("/hr/policies/acknowledgements");
}

export default async function PolicyAcknowledgementsPage({
  searchParams,
}: {
  searchParams: Promise<{ policy?: string; status?: string; page?: string; error?: string; sent?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await hrContext();

  const policyId = strParam(sp.policy);
  const status = parseEnum(AcknowledgementStatus, sp.status);
  const page = intParam(sp.page, 1, 500);

  const where = {
    organisationId,
    ...(policyId ? { policyId } : {}),
    ...(status ? { status } : {}),
  };

  const [total, rows, policies, statusGroups, byPolicy] = await Promise.all([
    prisma.policyAcknowledgement.count({ where }),
    prisma.policyAcknowledgement.findMany({
      where,
      orderBy: [{ policy: { title: "asc" } }, { employee: { lastName: "asc" } }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        policy: { select: { id: true, title: true } },
      },
    }),
    prisma.policy.findMany({
      where: { organisationId },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.policyAcknowledgement.groupBy({
      by: ["status"],
      where: { organisationId },
      _count: true,
    }),
    prisma.policyAcknowledgement.groupBy({
      by: ["policyId", "status"],
      where: { organisationId },
      _count: { _all: true },
    }),
  ]);

  const countMap = new Map<string, number>(
    statusGroups.map((g): [string, number] => [g.status, g._count])
  );
  const totalAll = statusGroups.reduce((a, g) => a + g._count, 0);
  const ackd = countMap.get("ACKNOWLEDGED") ?? 0;
  const rate = totalAll ? Math.round((ackd / totalAll) * 100) : 0;

  const segments: DonutSegment[] = [
    { label: "Acknowledged", value: ackd, tone: CHART_TONE.ACKNOWLEDGED },
    { label: "Pending", value: countMap.get("PENDING") ?? 0, tone: CHART_TONE.PENDING },
    { label: "Overdue", value: countMap.get("OVERDUE") ?? 0, tone: CHART_TONE.OVERDUE },
    { label: "Waived", value: countMap.get("WAIVED") ?? 0, tone: CHART_TONE.WAIVED },
  ].filter((s) => s.value > 0);

  const perPolicy = new Map<string, { ackd: number; total: number }>();
  for (const g of byPolicy) {
    const entry = perPolicy.get(g.policyId) ?? { ackd: 0, total: 0 };
    entry.total += g._count._all;
    if (g.status === "ACKNOWLEDGED") entry.ackd += g._count._all;
    perPolicy.set(g.policyId, entry);
  }
  const coverageBars: BarItem[] = policies
    .map((p) => {
      const e = perPolicy.get(p.id) ?? { ackd: 0, total: 0 };
      const pct = e.total ? Math.round((e.ackd / e.total) * 100) : 0;
      return {
        label: p.title,
        value: e.ackd,
        tone: (pct >= 80 ? "emerald" : pct >= 50 ? "amber" : "rose") as BarItem["tone"],
        hint: `${pct}% of ${e.total}`,
      };
    })
    .sort((a, b) => b.value - a.value);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = { policy: policyId || undefined, status: sp.status };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Policy acknowledgements
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · track who has acknowledged each policy
          </p>
        </div>
        <form action={sendReminder}>
          <button type="submit" className="btn-primary">
            Send reminder to all
          </button>
        </form>
      </div>

      {sp.error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {sp.error}
        </p>
      )}
      {sp.sent && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          Reminder queued as an in-app notification.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Acknowledgements" value={totalAll} hint="Across all policies" tone="sky" />
        <StatCard
          label="Acknowledged"
          value={`${rate}%`}
          hint={`${ackd} responses`}
          tone={rate >= 80 ? "emerald" : "amber"}
        />
        <StatCard
          label="Pending"
          value={countMap.get("PENDING") ?? 0}
          hint="Awaiting a response"
          tone="amber"
        />
        <StatCard
          label="Overdue"
          value={countMap.get("OVERDUE") ?? 0}
          hint="Past their due date"
          tone={(countMap.get("OVERDUE") ?? 0) ? "rose" : "emerald"}
        />
      </div>

      {totalAll > 0 && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <ChartPanel title="Acknowledgement status" subtitle="Every issued acknowledgement">
            <Donut
              segments={segments}
              size={140}
              thickness={16}
              centerValue={`${rate}%`}
              centerLabel="acknowledged"
            />
          </ChartPanel>
          <ChartPanel title="Coverage by policy" subtitle="Acknowledged responses per policy">
            <BarList items={coverageBars} valueFormat={(v) => `${v} ack`} />
          </ChartPanel>
        </div>
      )}

      <form method="GET" action="/hr/policies/acknowledgements" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="pa-policy">
            Policy
          </label>
          <select id="pa-policy" name="policy" defaultValue={policyId} className="input">
            <option value="">All policies</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pa-status">
            Status
          </label>
          <select id="pa-status" name="status" defaultValue={sp.status ?? ""} className="input !w-40">
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="OVERDUE">Overdue</option>
            <option value="WAIVED">Waived</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
      </form>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No acknowledgements match these filters"
            hint="Publish a policy to issue acknowledgements, or clear the filters."
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Employee</th>
                  <th className="th">Policy</th>
                  <th className="th">Status</th>
                  <th className="th">Due date</th>
                  <th className="th">Acknowledged</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">
                      {a.employee.firstName} {a.employee.lastName}
                      <span className="ml-1.5 text-[11px] text-slate-400">
                        {a.employee.employeeNumber}
                      </span>
                    </td>
                    <td className="td text-slate-600">{a.policy.title}</td>
                    <td className="td">
                      <Badge tone={ACK_TONE[a.status] ?? "slate"}>{a.status}</Badge>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {a.dueDate ? formatDate(a.dueDate) : "—"}
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {a.acknowledgedAt ? formatDate(a.acknowledgedAt) : "—"}
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <form action={updateAcknowledgement} className="flex items-center gap-1">
                          <input type="hidden" name="id" value={a.id} />
                          <select
                            name="status"
                            defaultValue={a.status}
                            className="input !w-36 !py-1 text-[11px]"
                          >
                            <option value="PENDING">Pending</option>
                            <option value="ACKNOWLEDGED">Acknowledged</option>
                            <option value="OVERDUE">Overdue</option>
                            <option value="WAIVED">Waived</option>
                          </select>
                          <button
                            type="submit"
                            className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-100"
                          >
                            Save
                          </button>
                        </form>
                        <form action={sendReminder}>
                          <input type="hidden" name="policyId" value={a.policyId} />
                          <button
                            type="submit"
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
                          >
                            Remind
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {pages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Page {page} of {pages} · {total} acknowledgements
                </span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={qs({ ...base, page: page - 1 })}
                      className="btn-secondary !py-1.5 text-xs"
                    >
                      ← Previous
                    </Link>
                  )}
                  {page < pages && (
                    <Link
                      href={qs({ ...base, page: page + 1 })}
                      className="btn-secondary !py-1.5 text-xs"
                    >
                      Next →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
