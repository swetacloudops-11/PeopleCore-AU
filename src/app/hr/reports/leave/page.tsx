import { prisma } from "@/lib/prisma";
import { hrContext, qs, intParam } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import {
  ChartPanel,
  Donut,
  BarList,
  ColumnChart,
  ProgressBar,
  type DonutSegment,
  type BarItem,
  type ColumnPoint,
  type Tone,
} from "@/components/charts";
import { cx } from "@/lib/format";

const RANGE_CHIPS = [30, 90, 180, 365, 1095] as const;
const RANGE_LABEL: Record<number, string> = {
  30: "30 days",
  90: "90 days",
  180: "6 months",
  365: "12 months",
  1095: "3 years",
};

const STATUS_TONE: Record<string, Tone> = {
  APPROVED: "emerald",
  PENDING: "amber",
  REJECTED: "rose",
  CANCELLED: "slate",
  DRAFT: "violet",
};

const BADGE_TONE: Record<string, string> = {
  APPROVED: "green",
  PENDING: "amber",
  REJECTED: "red",
  CANCELLED: "slate",
  DRAFT: "purple",
};

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const startOfRange = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
};

export default async function HrLeaveReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId } = await hrContext();
  const range = intParam(sp.range, 365, 3650);
  const since = startOfRange(range);
  const now = new Date();

  const [requests, types, byStatus, byTypeGroup] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { organisationId, startDate: { gte: since } },
      select: {
        id: true,
        startDate: true,
        days: true,
        status: true,
        employee: { select: { id: true, firstName: true, lastName: true, departmentId: true } },
        leaveType: { select: { id: true, name: true, colour: true, unit: true } },
      },
    }),
    prisma.leaveType.findMany({
      where: { organisationId },
      select: { id: true, name: true, colour: true, unit: true },
      orderBy: { name: "asc" },
    }),
    prisma.leaveRequest.groupBy({
      by: ["status"],
      where: { organisationId, startDate: { gte: since } },
      _count: { _all: true },
    }),
    prisma.leaveRequest.groupBy({
      by: ["leaveTypeId"],
      where: { organisationId, startDate: { gte: since } },
      _count: { _all: true },
      _sum: { days: true },
    }),
  ]);

  const n = (v: { toString(): string } | null | undefined) =>
    v === null || v === undefined ? 0 : Number(v);

  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const typeColour = new Map(types.map((t) => [t.id, t.colour]));

  const totalRequests = requests.length;
  const approved = requests.filter((r) => r.status === "APPROVED");
  const approvedDays = approved.reduce((sum, r) => sum + n(r.days), 0);
  const decided = requests.filter((r) => r.status === "APPROVED" || r.status === "REJECTED");
  const approvalRate = decided.length
    ? Math.round((approved.length / decided.length) * 100)
    : 0;
  const pending = requests.filter((r) => r.status === "PENDING").length;

  // ── status donut ──
  const statusSegments: DonutSegment[] = byStatus
    .map((s) => ({
      label: pretty(s.status),
      value: s._count._all,
      tone: STATUS_TONE[s.status] ?? "slate",
    }))
    .sort((a, b) => b.value - a.value);

  // ── usage by type ──
  const typeItems: BarItem[] = [...byTypeGroup]
    .map((t) => ({
      label: typeName.get(t.leaveTypeId) ?? "Unknown type",
      value: Math.round(n(t._sum.days) * 10) / 10,
      color: typeColour.get(t.leaveTypeId),
      hint: `${t._count._all} request${t._count._all === 1 ? "" : "s"}`,
    }))
    .sort((a, b) => b.value - a.value);

  // ── monthly days ──
  const monthCount = Math.min(12, Math.max(3, Math.round(range / 30)));
  const months: { key: string; label: string; days: number; count: number }[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
      days: 0,
      count: 0,
    });
  }
  const monthIdx = new Map(months.map((m, i) => [m.key, i]));
  for (const r of approved) {
    const key = `${r.startDate.getFullYear()}-${String(r.startDate.getMonth() + 1).padStart(2, "0")}`;
    const idx = monthIdx.get(key);
    if (idx !== undefined) {
      months[idx].days += n(r.days);
      months[idx].count += 1;
    }
  }
  const monthPoints: ColumnPoint[] = months.map((m) => ({
    label: m.label,
    value: Math.round(m.days * 10) / 10,
    tone: "sky",
  }));

  // ── top takers ──
  const takers = new Map<string, { name: string; days: number; count: number }>();
  for (const r of approved) {
    const key = `${r.employee.firstName} ${r.employee.lastName}`;
    const cur = takers.get(key) ?? { name: key, days: 0, count: 0 };
    cur.days += n(r.days);
    cur.count += 1;
    takers.set(key, cur);
  }
  const topTakers: BarItem[] = [...takers.values()]
    .sort((a, b) => b.days - a.days)
    .slice(0, 8)
    .map((t) => ({
      label: t.name,
      value: Math.round(t.days * 10) / 10,
      tone: "violet",
      hint: `${t.count} request${t.count === 1 ? "" : "s"}`,
    }));

  // ── by-type table ──
  const byType = types
    .map((t) => {
      const rows = requests.filter((r) => r.leaveType.id === t.id);
      const appr = rows.filter((r) => r.status === "APPROVED").length;
      const rej = rows.filter((r) => r.status === "REJECTED").length;
      const dec = appr + rej;
      return {
        id: t.id,
        name: t.name,
        unit: t.unit,
        colour: t.colour,
        count: rows.length,
        days: rows.reduce((sum, r) => sum + n(r.days), 0),
        approved: appr,
        pending: rows.filter((r) => r.status === "PENDING").length,
        rejected: rej,
        rate: dec ? Math.round((appr / dec) * 100) : 0,
      };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.days - a.days);

  return (
    <div>
      <PageHeader
        title="Leave Reports"
        subtitle="Leave usage by type and month, top takers and approval performance."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {RANGE_CHIPS.map((d) => (
            <a
              key={d}
              href={`/hr/reports/leave${qs({ range: d })}`}
              className={cx(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                range === d
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              Last {RANGE_LABEL[d]}
            </a>
          ))}
        </div>
        <span className="text-[11px] text-slate-400">
          Requests with a start date inside the range
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Leave requests" value={totalRequests} hint="In selected range" tone="sky" />
        <StatCard label="Approved days" value={approvedDays.toFixed(1)} hint={`${approved.length} requests`} tone="emerald" />
        <StatCard
          label="Approval rate"
          value={`${approvalRate}%`}
          hint={`${decided.length} decided`}
          tone={approvalRate >= 70 ? "emerald" : "amber"}
        />
        <StatCard label="Pending" value={pending} hint="Awaiting review" tone={pending ? "amber" : "emerald"} />
        <StatCard
          label="Leave types used"
          value={byType.length}
          hint={`${types.length} configured`}
          tone="indigo"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Requests by status" subtitle="In selected range">
          <Donut
            segments={statusSegments}
            size={148}
            thickness={18}
            centerValue={totalRequests}
            centerLabel="requests"
          />
        </ChartPanel>

        <ChartPanel title="Leave days by type" subtitle="Approved and pending days">
          <BarList items={typeItems} valueFormat={(v) => v.toFixed(1)} />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <ProgressBar
              value={approved.length}
              max={Math.max(1, totalRequests)}
              tone="emerald"
              label="Requests approved"
            />
          </div>
        </ChartPanel>

        <ChartPanel
          className="lg:col-span-2"
          title="Approved days by month"
          subtitle={`Last ${months.length} months`}
        >
          <ColumnChart points={monthPoints} tone="sky" height={160} valueFormat={(v) => v.toFixed(1)} />
        </ChartPanel>

        <ChartPanel title="Top leave takers" subtitle="Approved days per employee">
          <BarList items={topTakers} valueFormat={(v) => v.toFixed(1)} />
        </ChartPanel>

        <ChartPanel title="Approval performance" subtitle="Decided requests only">
          <div className="space-y-4">
            <ProgressBar value={approvalRate} tone="emerald" label="Approval rate" />
            <ProgressBar
              value={approvedDays}
              max={Math.max(1, approvedDays + requests.filter((r) => r.status === "PENDING").reduce((s, r) => s + n(r.days), 0))}
              tone="sky"
              label="Approved of approved + pending days"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {(["APPROVED", "PENDING", "REJECTED", "CANCELLED", "DRAFT"] as const).map((s) => {
                const count = requests.filter((r) => r.status === s).length;
                return (
                  <Badge key={s} tone={BADGE_TONE[s] ?? "slate"}>
                    {count} {pretty(s)}
                  </Badge>
                );
              })}
            </div>
          </div>
        </ChartPanel>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Leave by type</h2>
        {byType.length === 0 ? (
          <EmptyState
            title="No leave requests in this range"
            hint="Widen the date range or check back once leave has been requested."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Leave type</th>
                <th className="th">Requests</th>
                <th className="th">Days</th>
                <th className="th">Approved</th>
                <th className="th">Pending</th>
                <th className="th">Rejected</th>
                <th className="th">Approval rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byType.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: t.colour }}
                      />
                      {t.name}
                    </span>
                    <div className="text-[11px] text-slate-400">per {t.unit.toLowerCase()}</div>
                  </td>
                  <td className="td tabular-nums text-slate-700">{t.count}</td>
                  <td className="td tabular-nums text-slate-700">{t.days.toFixed(1)}</td>
                  <td className="td">
                    <Badge tone="green">{t.approved}</Badge>
                  </td>
                  <td className="td">
                    <Badge tone={t.pending ? "amber" : "slate"}>{t.pending}</Badge>
                  </td>
                  <td className="td">
                    <Badge tone={t.rejected ? "red" : "slate"}>{t.rejected}</Badge>
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: `${t.rate}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-slate-600">{t.rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
