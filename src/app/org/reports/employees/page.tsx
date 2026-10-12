import { prisma } from "@/lib/prisma";
import { orgContext, qs, strParam } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { cx } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const SORTS = ["name", "headcount", "active", "tenure", "fulltime"] as const;
type SortKey = (typeof SORTS)[number];

const monthsBetween = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Horizontal bar row used across the report charts. */
function BarRow({
  label,
  value,
  count,
  pct,
  tone = "bg-indigo-500",
}: {
  label: string;
  value: string;
  count: number;
  pct: number;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-40 shrink-0 truncate text-xs text-slate-600">{label}</span>
      <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
        <div className={`h-full rounded ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500">
        {value} <span className="text-slate-400">({count})</span>
      </span>
    </div>
  );
}

export default async function EmployeeReportsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const { organisationId } = await orgContext();
  const sort = SORTS.includes(strParam(one(sp.sort)) as SortKey)
    ? (strParam(one(sp.sort)) as SortKey)
    : "headcount";
  const dir = strParam(one(sp.dir)) === "asc" ? 1 : -1;

  const [employees, departments, locations, byType, byStatus] = await Promise.all([
    prisma.employee.findMany({
      where: { organisationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        hireDate: true,
        terminationDate: true,
        employmentStatus: true,
        employmentType: true,
        departmentId: true,
        locationId: true,
      },
    }),
    prisma.department.findMany({
      where: { organisationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      where: { organisationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.groupBy({
      by: ["employmentType"],
      where: { organisationId },
      _count: { _all: true },
    }),
    prisma.employee.groupBy({
      by: ["employmentStatus"],
      where: { organisationId },
      _count: { _all: true },
    }),
  ]);

  const now = new Date();
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const locName = new Map(locations.map((l) => [l.id, l.name]));

  const countBy = (key: "departmentId" | "locationId") => {
    const map = new Map<string, number>();
    for (const e of employees) {
      const k = e[key] ?? "none";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  };
  const deptCounts = countBy("departmentId");
  const locCounts = countBy("locationId");

  const maxDept = Math.max(1, ...deptCounts.values());
  const maxLoc = Math.max(1, ...locCounts.values());
  const maxType = Math.max(1, ...byType.map((t) => t._count._all));
  const maxStatus = Math.max(1, ...byStatus.map((s) => s._count._all));

  // ── Tenure bands (current staff only) ──
  const current = employees.filter((e) => !e.terminationDate);
  const bands = [
    { label: "Under 6 months", min: 0, max: 6 },
    { label: "6–12 months", min: 6, max: 12 },
    { label: "1–2 years", min: 12, max: 24 },
    { label: "2–5 years", min: 24, max: 60 },
    { label: "5+ years", min: 60, max: Number.MAX_SAFE_INTEGER },
  ].map((b) => ({
    ...b,
    count: current.filter((e) => {
      const m = monthsBetween(e.hireDate, now);
      return m >= b.min && m < b.max;
    }).length,
  }));
  const maxBand = Math.max(1, ...bands.map((b) => b.count));
  const avgTenureMonths = current.length
    ? Math.round(
        current.reduce((n, e) => n + monthsBetween(e.hireDate, now), 0) / current.length
      )
    : 0;

  // ── New starters vs leavers, last 12 months ──
  const monthKeys: Array<{ key: string; label: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
    });
  }
  const inMonth = (date: Date | null, key: string) =>
    date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` === key
      : false;
  const flows = monthKeys.map((m) => ({
    ...m,
    starters: employees.filter((e) => inMonth(e.hireDate, m.key)).length,
    leavers: employees.filter((e) => inMonth(e.terminationDate, m.key)).length,
  }));
  const maxFlow = Math.max(1, ...flows.flatMap((f) => [f.starters, f.leavers]));

  // ── Department summary (sortable) ──
  const summary = departments.map((d) => {
    const members = employees.filter((e) => e.departmentId === d.id);
    const active = members.filter((e) => !e.terminationDate);
    const fullTime = members.filter((e) => e.employmentType === "FULL_TIME").length;
    const tenure = active.length
      ? Math.round(active.reduce((n, e) => n + monthsBetween(e.hireDate, now), 0) / active.length)
      : 0;
    return {
      id: d.id,
      name: d.name,
      headcount: members.length,
      active: active.length,
      tenure,
      fulltime: members.length ? Math.round((fullTime / members.length) * 100) : 0,
    };
  });
  const value = (s: (typeof summary)[number]) => {
    switch (sort) {
      case "name":
        return s.name.toLowerCase();
      case "active":
        return s.active;
      case "tenure":
        return s.tenure;
      case "fulltime":
        return s.fulltime;
      default:
        return s.headcount;
    }
  };
  summary.sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
    return ((av as number) - (bv as number)) * dir;
  });

  const activeCount = current.length;
  const terminated = employees.length - activeCount;

  const th = (key: SortKey, label: string) => (
    <th className="th">
      <a
        href={qs({ sort: key, dir: sort === key && dir === -1 ? "asc" : "desc" })}
        className={cx(
          "inline-flex items-center gap-1 hover:text-indigo-600",
          sort === key && "text-indigo-600"
        )}
      >
        {label}
        <span className="text-[9px]">{sort === key ? (dir === -1 ? "▼" : "▲") : "↕"}</span>
      </a>
    </th>
  );

  return (
    <div>
      <PageHeader
        title="Employee Reports"
        subtitle="Headcount, tenure and movement — read-only aggregates for this organisation."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total headcount" value={employees.length} hint={`${departments.length} departments`} tone="indigo" />
        <StatCard label="Active" value={activeCount} hint="No termination date" tone="emerald" />
        <StatCard label="Terminated" value={terminated} hint="Historical leavers" tone={terminated ? "rose" : "emerald"} />
        <StatCard
          label="Average tenure"
          value={`${(avgTenureMonths / 12).toFixed(1)} yrs`}
          hint={`${avgTenureMonths} months`}
          tone="sky"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Headcount by department</h2>
          {deptCounts.size === 0 ? (
            <EmptyState title="No departments" />
          ) : (
            <div>
              {[...deptCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([id, count]) => (
                  <BarRow
                    key={id}
                    label={id === "none" ? "Unassigned" : deptName.get(id) ?? "Unknown"}
                    value={String(count)}
                    count={count}
                    pct={Math.round((count / maxDept) * 100)}
                  />
                ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Headcount by location</h2>
          {locCounts.size === 0 ? (
            <EmptyState title="No locations" />
          ) : (
            <div>
              {[...locCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([id, count]) => (
                  <BarRow
                    key={id}
                    label={id === "none" ? "Unassigned" : locName.get(id) ?? "Unknown"}
                    value={String(count)}
                    count={count}
                    pct={Math.round((count / maxLoc) * 100)}
                    tone="bg-sky-500"
                  />
                ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">By employment type</h2>
          {[...byType]
            .sort((a, b) => b._count._all - a._count._all)
            .map((t) => (
              <BarRow
                key={t.employmentType}
                label={pretty(t.employmentType)}
                value={String(t._count._all)}
                count={t._count._all}
                pct={Math.round((t._count._all / maxType) * 100)}
                tone="bg-emerald-500"
              />
            ))}
        </div>

        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">By employment status</h2>
          {[...byStatus]
            .sort((a, b) => b._count._all - a._count._all)
            .map((s) => (
              <BarRow
                key={s.employmentStatus}
                label={pretty(s.employmentStatus)}
                value={String(s._count._all)}
                count={s._count._all}
                pct={Math.round((s._count._all / maxStatus) * 100)}
                tone={
                  s.employmentStatus === "TERMINATED"
                    ? "bg-rose-500"
                    : s.employmentStatus === "ACTIVE"
                    ? "bg-emerald-500"
                    : "bg-amber-500"
                }
              />
            ))}
        </div>

        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Tenure bands</h2>
          {bands.map((b) => (
            <BarRow
              key={b.label}
              label={b.label}
              value={String(b.count)}
              count={b.count}
              pct={Math.round((b.count / maxBand) * 100)}
              tone="bg-violet-500"
            />
          ))}
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              New starters vs leavers (12 months)
            </h2>
            <span className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Starters
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-rose-500" /> Leavers
              </span>
            </span>
          </div>
          <div className="flex h-40 items-end gap-1.5">
            {flows.map((f) => (
              <div key={f.key} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end justify-center gap-0.5">
                  <div
                    className="w-1/2 rounded-t bg-emerald-500"
                    style={{ height: `${(f.starters / maxFlow) * 100}%` }}
                    title={`${f.starters} starters`}
                  />
                  <div
                    className="w-1/2 rounded-t bg-rose-500"
                    style={{ height: `${(f.leavers / maxFlow) * 100}%` }}
                    title={`${f.leavers} leavers`}
                  />
                </div>
                <span className="text-[9px] text-slate-400">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sortable department summary ── */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Department summary</h2>
          <span className="text-[11px] text-slate-400">Click a column header to sort</span>
        </div>
        {summary.length === 0 ? (
          <EmptyState title="No departments yet" hint="Create departments to see this breakdown." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                {th("name", "Department")}
                {th("headcount", "Headcount")}
                {th("active", "Active")}
                {th("tenure", "Avg tenure (months)")}
                {th("fulltime", "Full-time %")}
                <th className="th">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">{s.name}</td>
                  <td className="td tabular-nums text-slate-700">{s.headcount}</td>
                  <td className="td">
                    <Badge tone={s.active ? "green" : "slate"}>{s.active}</Badge>
                  </td>
                  <td className="td tabular-nums text-slate-700">{s.tenure}</td>
                  <td className="td tabular-nums text-slate-700">{s.fulltime}%</td>
                  <td className="td">
                    <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{
                          width: `${Math.round((s.headcount / Math.max(1, employees.length)) * 100)}%`,
                        }}
                      />
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
