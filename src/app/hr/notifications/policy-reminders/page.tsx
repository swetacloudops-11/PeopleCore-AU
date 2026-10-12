import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam, strParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { BarList, ChartPanel, Donut, type BarItem, type DonutSegment } from "@/components/charts";
import { formatDate, daysUntil } from "@/lib/format";

const PAGE = 25;

const OUTSTANDING = ["PENDING", "OVERDUE"] as const;

function bail(message: string): never {
  redirect(`/hr/notifications/policy-reminders?error=${encodeURIComponent(message)}`);
}

/** Queue a policy acknowledgement reminder as an OrgNotification. */
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

  revalidatePath("/hr/notifications/policy-reminders");
  redirect("/hr/notifications/policy-reminders?sent=1");
}

export default async function PolicyRemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ policy?: string; page?: string; error?: string; sent?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await hrContext();

  const policyId = strParam(sp.policy);
  const page = intParam(sp.page, 1, 500);

  const where = {
    organisationId,
    status: { in: [...OUTSTANDING] },
    ...(policyId ? { policyId } : {}),
  };

  const [total, rows, policies, outstandingGroups, overdue] = await Promise.all([
    prisma.policyAcknowledgement.count({ where }),
    prisma.policyAcknowledgement.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { policy: { title: "asc" } }],
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
      by: ["policyId", "status"],
      where: { organisationId, status: { in: ["PENDING", "OVERDUE"] } },
      _count: { _all: true },
    }),
    prisma.policyAcknowledgement.count({ where: { organisationId, status: "OVERDUE" } }),
  ]);

  const perPolicy = new Map<string, number>();
  for (const g of outstandingGroups) {
    perPolicy.set(g.policyId, (perPolicy.get(g.policyId) ?? 0) + g._count._all);
  }
  const totalOutstanding = Array.from(perPolicy.values()).reduce((a, b) => a + b, 0);
  const policiesOutstanding = perPolicy.size;

  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const dueThisWeek = await prisma.policyAcknowledgement.count({
    where: {
      organisationId,
      status: { in: ["PENDING", "OVERDUE"] },
      dueDate: { lte: weekEnd },
    },
  });

  const segments: DonutSegment[] = (
    [
      { label: "Pending", value: totalOutstanding - overdue, tone: "amber" },
      { label: "Overdue", value: overdue, tone: "rose" },
    ] as DonutSegment[]
  ).filter((s) => s.value > 0);

  const bars: BarItem[] = policies
    .map(
      (p): BarItem => ({
        label: p.title,
        value: perPolicy.get(p.id) ?? 0,
        tone: "sky",
        href: `/hr/notifications/policy-reminders?policy=${p.id}`,
      })
    )
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = { policy: policyId || undefined };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Policy reminders
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · outstanding policy acknowledgements to chase
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
        <StatCard label="Outstanding" value={totalOutstanding} hint="Not yet acknowledged" tone="sky" />
        <StatCard
          label="Overdue"
          value={overdue}
          hint="Past their due date"
          tone={overdue ? "rose" : "emerald"}
        />
        <StatCard label="Due this week" value={dueThisWeek} hint="Within 7 days" tone="amber" />
        <StatCard label="Policies affected" value={policiesOutstanding} hint="With reminders" tone="indigo" />
      </div>

      {totalOutstanding > 0 && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <ChartPanel title="Outstanding acknowledgements" subtitle="Pending vs overdue">
            <Donut
              segments={segments}
              size={140}
              thickness={16}
              centerValue={totalOutstanding}
              centerLabel="outstanding"
            />
          </ChartPanel>
          <ChartPanel title="By policy" subtitle="Where the reminders are needed">
            <BarList items={bars} valueFormat={(v) => `${v} due`} />
          </ChartPanel>
        </div>
      )}

      <form method="GET" action="/hr/notifications/policy-reminders" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="pr-policy">
            Policy
          </label>
          <select id="pr-policy" name="policy" defaultValue={policyId} className="input">
            <option value="">All policies</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
      </form>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No outstanding policy reminders"
            hint="Everyone is up to date — reminders appear here when acknowledgements are pending."
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
                  <th className="th">Due in</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => {
                  const left = a.dueDate ? daysUntil(a.dueDate) : null;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/70">
                      <td className="td font-medium text-slate-800">
                        {a.employee.firstName} {a.employee.lastName}
                        <span className="ml-1.5 text-[11px] text-slate-400">
                          {a.employee.employeeNumber}
                        </span>
                      </td>
                      <td className="td text-slate-600">{a.policy.title}</td>
                      <td className="td">
                        <Badge tone={a.status === "OVERDUE" ? "red" : "amber"}>{a.status}</Badge>
                      </td>
                      <td className="td whitespace-nowrap text-slate-500">
                        {a.dueDate ? formatDate(a.dueDate) : "No due date"}
                      </td>
                      <td className="td whitespace-nowrap">
                        {left === null ? (
                          <span className="text-slate-400">—</span>
                        ) : left < 0 ? (
                          <span className="font-medium text-rose-600">{Math.abs(left)}d overdue</span>
                        ) : (
                          <span className={left <= 7 ? "font-medium text-amber-600" : "text-slate-500"}>
                            {left}d left
                          </span>
                        )}
                      </td>
                      <td className="td">
                        <div className="flex justify-end">
                          <form action={sendReminder}>
                            <input type="hidden" name="policyId" value={a.policyId} />
                            <button
                              type="submit"
                              className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-100"
                            >
                              Send reminder
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>

            {pages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Page {page} of {pages} · {total} outstanding
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
