import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { cx } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LeaveReportsPage() {
  const { organisationId } = await orgContext();

  const [requests, types, balances, departments] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { organisationId },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        days: true,
        status: true,
        employee: {
          select: {
            firstName: true,
            lastName: true,
            departmentId: true,
          },
        },
        leaveType: { select: { id: true, name: true, colour: true, unit: true } },
      },
    }),
    prisma.leaveType.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, colour: true },
    }),
    prisma.leaveBalance.groupBy({
      by: ["leaveTypeId"],
      where: { organisationId },
      _sum: { entitlement: true, taken: true, pending: true, carriedOver: true },
    }),
    prisma.department.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const n = (v: { toString(): string } | null | undefined) =>
    v === null || v === undefined ? 0 : Number(v);

  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const typeName = new Map(types.map((t) => [t.id, t.name]));

  // ── By leave type ──
  const byType = types.map((t) => {
    const rows = requests.filter((r) => r.leaveType.id === t.id);
    return {
      id: t.id,
      name: t.name,
      colour: t.colour,
      count: rows.length,
      days: rows.reduce((sum, r) => sum + n(r.days), 0),
      approved: rows.filter((r) => r.status === "APPROVED").length,
      pending: rows.filter((r) => r.status === "PENDING").length,
    };
  });
  const maxTypeDays = Math.max(1, ...byType.map((t) => t.days));

  // ── By department ──
  const byDept = new Map<string, { days: number; count: number }>();
  for (const r of requests) {
    if (r.status !== "APPROVED") continue;
    const key = r.employee.departmentId ?? "none";
    const cur = byDept.get(key) ?? { days: 0, count: 0 };
    cur.days += n(r.days);
    cur.count += 1;
    byDept.set(key, cur);
  }
  const deptRows = [...byDept.entries()]
    .map(([id, v]) => ({ id, name: id === "none" ? "Unassigned" : deptName.get(id) ?? "Unknown", ...v }))
    .sort((a, b) => b.days - a.days);
  const maxDeptDays = Math.max(1, ...deptRows.map((d) => d.days));

  // ── By month (last 12) ──
  const now = new Date();
  const months: Array<{ key: string; label: string; days: number; count: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
      days: 0,
      count: 0,
    });
  }
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));
  for (const r of requests) {
    if (r.status !== "APPROVED") continue;
    const key = `${r.startDate.getFullYear()}-${String(r.startDate.getMonth() + 1).padStart(2, "0")}`;
    const idx = monthIndex.get(key);
    if (idx !== undefined) {
      months[idx].days += n(r.days);
      months[idx].count += 1;
    }
  }
  const maxMonthDays = Math.max(1, ...months.map((m) => m.days));

  // ── Status split ──
  const statusCount = (s: string) => requests.filter((r) => r.status === s).length;
  const approvedDays = requests
    .filter((r) => r.status === "APPROVED")
    .reduce((sum, r) => sum + n(r.days), 0);
  const pendingDays = requests
    .filter((r) => r.status === "PENDING")
    .reduce((sum, r) => sum + n(r.days), 0);

  // ── Top takers ──
  const takers = new Map<string, { name: string; days: number; count: number }>();
  for (const r of requests) {
    if (r.status !== "APPROVED") continue;
    const key = `${r.employee.firstName} ${r.employee.lastName}`;
    const cur = takers.get(key) ?? { name: key, days: 0, count: 0 };
    cur.days += n(r.days);
    cur.count += 1;
    takers.set(key, cur);
  }
  const topTakers = [...takers.values()].sort((a, b) => b.days - a.days).slice(0, 8);
  const maxTakerDays = Math.max(1, ...topTakers.map((t) => t.days));

  // ── Remaining liability ──
  const liability = balances.map((b) => {
    const entitlement = n(b._sum.entitlement);
    const taken = n(b._sum.taken);
    const pending = n(b._sum.pending);
    const carried = n(b._sum.carriedOver);
    const remaining = entitlement + carried - taken - pending;
    return {
      id: b.leaveTypeId,
      name: typeName.get(b.leaveTypeId) ?? "Unknown type",
      entitlement,
      carried,
      taken,
      pending,
      remaining: Math.max(0, remaining),
    };
  });
  const totalLiability = liability.reduce((sum, l) => sum + l.remaining, 0);
  const maxRemaining = Math.max(1, ...liability.map((l) => l.remaining));

  return (
    <div>
      <PageHeader
        title="Leave Reports"
        subtitle="Leave usage by type, team and month — plus remaining balance liability."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Approved days" value={approvedDays.toFixed(1)} hint={`${statusCount("APPROVED")} approved requests`} tone="emerald" />
        <StatCard label="Pending days" value={pendingDays.toFixed(1)} hint={`${statusCount("PENDING")} awaiting review`} tone={pendingDays ? "amber" : "emerald"} />
        <StatCard
          label="Top leave type"
          value={byType.sort((a, b) => b.days - a.days)[0]?.name ?? "—"}
          hint={`${(byType[0]?.days ?? 0).toFixed(1)} days taken`}
          tone="sky"
        />
        <StatCard
          label="Remaining liability"
          value={`${totalLiability.toFixed(1)} d`}
          hint="Available balances left"
          tone="indigo"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── By type ── */}
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Leave taken by type</h2>
          {byType.length === 0 ? (
            <EmptyState title="No leave types configured" />
          ) : (
            byType.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-1.5">
                <span className="w-32 shrink-0 truncate text-xs text-slate-600">{t.name}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.round((t.days / maxTypeDays) * 100)}%`,
                      backgroundColor: t.colour,
                    }}
                  />
                </div>
                <span className="w-32 shrink-0 text-right text-xs tabular-nums text-slate-500">
                  {t.days.toFixed(1)} d <span className="text-slate-400">({t.count})</span>
                </span>
              </div>
            ))
          )}
          <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            <span>
              <Badge tone="green">{statusCount("APPROVED")} approved</Badge>
            </span>
            <span>
              <Badge tone="amber">{statusCount("PENDING")} pending</Badge>
            </span>
            <span>
              <Badge tone="red">{statusCount("REJECTED")} rejected</Badge>
            </span>
            <span>
              <Badge tone="slate">{statusCount("CANCELLED") + statusCount("DRAFT")} other</Badge>
            </span>
          </div>
        </div>

        {/* ── By month ── */}
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Approved days by month</h2>
          <div className="flex h-44 items-end gap-1.5">
            {months.map((m) => (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[9px] tabular-nums text-slate-400">
                  {m.days ? m.days.toFixed(0) : ""}
                </span>
                <div
                  className="w-full rounded-t bg-sky-500"
                  style={{ height: `${(m.days / maxMonthDays) * 100}%` }}
                  title={`${m.days.toFixed(1)} days`}
                />
                <span className="text-[9px] text-slate-400">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── By department ── */}
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            Approved days by department
          </h2>
          {deptRows.length === 0 ? (
            <EmptyState title="No approved leave yet" />
          ) : (
            deptRows.map((d) => (
              <div key={d.id} className="flex items-center gap-3 py-1.5">
                <span className="w-36 shrink-0 truncate text-xs text-slate-600">{d.name}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded bg-emerald-500"
                    style={{ width: `${Math.round((d.days / maxDeptDays) * 100)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-500">
                  {d.days.toFixed(1)} d <span className="text-slate-400">({d.count})</span>
                </span>
              </div>
            ))
          )}
        </div>

        {/* ── Top takers ── */}
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Top leave takers</h2>
          {topTakers.length === 0 ? (
            <EmptyState title="No approved leave yet" />
          ) : (
            topTakers.map((t, i) => (
              <div key={t.name} className="flex items-center gap-3 py-1.5">
                <span className="w-5 shrink-0 text-center text-[11px] font-semibold text-slate-400">
                  {i + 1}
                </span>
                <span className="w-40 shrink-0 truncate text-xs text-slate-600">{t.name}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded bg-violet-500"
                    style={{ width: `${Math.round((t.days / maxTakerDays) * 100)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500">
                  {t.days.toFixed(1)} d <span className="text-slate-400">×{t.count}</span>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Liability ── */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Remaining leave liability</h2>
          <span className="text-[11px] text-slate-400">
            Entitlement + carried over − taken − pending
          </span>
        </div>
        {liability.length === 0 ? (
          <EmptyState title="No leave balances yet" hint="Balances are created as leave accrues." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Leave type</th>
                <th className="th">Entitlement</th>
                <th className="th">Carried over</th>
                <th className="th">Taken</th>
                <th className="th">Pending</th>
                <th className="th">Remaining</th>
                <th className="th">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {liability.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">{l.name}</td>
                  <td className="td tabular-nums text-slate-700">{l.entitlement.toFixed(1)}</td>
                  <td className="td tabular-nums text-slate-700">{l.carried.toFixed(1)}</td>
                  <td className="td tabular-nums text-slate-700">{l.taken.toFixed(1)}</td>
                  <td className="td tabular-nums text-slate-700">{l.pending.toFixed(1)}</td>
                  <td className="td">
                    <span className="font-semibold tabular-nums text-slate-800">
                      {l.remaining.toFixed(1)} d
                    </span>
                  </td>
                  <td className="td">
                    <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cx(
                          "h-full rounded-full",
                          l.remaining > 0 ? "bg-emerald-500" : "bg-slate-300"
                        )}
                        style={{ width: `${Math.round((l.remaining / maxRemaining) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          Liability shown in days · total {totalLiability.toFixed(1)} days remaining across all
          leave types.
        </p>
      </div>
    </div>
  );
}
