import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge, EmptyState } from "@/components/ui";
import {
  BarList,
  ChartPanel,
  Donut,
  ProgressBar,
  type BarItem,
  type DonutSegment,
} from "@/components/charts";

/** Coloured dot guard — only trust well-formed hex colours from the DB. */
function dotColour(colour: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(colour) ? colour : "#94a3b8";
}

export default async function LeaveBalancePage() {
  const { employee } = await employeeContext();
  const year = new Date().getFullYear();

  const balances = await prisma.leaveBalance.findMany({
    where: { employeeId: employee.id, year },
    include: {
      leaveType: { select: { name: true, colour: true, unit: true, isPaid: true } },
    },
    orderBy: { leaveType: { name: "asc" } },
  });

  // Plain rows — every Decimal converted with Number().
  // available = entitlement + carriedOver − taken − pending
  const rows = balances.map((b) => {
    const entitlement = Number(b.entitlement);
    const carriedOver = Number(b.carriedOver);
    const taken = Number(b.taken);
    const pending = Number(b.pending);
    const pool = entitlement + carriedOver;
    const used = taken + pending;
    return {
      id: b.id,
      name: b.leaveType.name,
      colour: b.leaveType.colour,
      unit: b.leaveType.unit,
      isPaid: b.leaveType.isPaid,
      entitlement,
      carriedOver,
      taken,
      pending,
      pool,
      available: Math.round((pool - used) * 10) / 10,
      usedPct: pool > 0 ? Math.min(100, Math.round((used / pool) * 100)) : 0,
    };
  });

  const suffix = (unit: string) => (unit === "HOURS" ? "h" : "d");

  const remainingItems = (rows
    .map((r): BarItem => ({
      label: r.name,
      value: Math.max(0, r.available),
      color: dotColour(r.colour),
      hint: `${r.taken.toFixed(1)}${suffix(r.unit)} of ${r.pool.toFixed(1)}${suffix(r.unit)} used`,
    }))
    .sort((a, b) => b.value - a.value));

  const totalTaken = rows.reduce((a, r) => a + r.taken, 0);
  const totalRemaining = rows.reduce((a, r) => a + Math.max(0, r.available), 0);
  const takenSegments = ([
    { label: "Taken", value: Math.round(totalTaken * 10) / 10, tone: "rose" as const },
    { label: "Remaining", value: Math.round(totalRemaining * 10) / 10, tone: "emerald" as const },
  ] as DonutSegment[]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            My Leave Balance
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {employee.firstName}, here is your leave for the {year} year.
          </p>
        </div>
        <Link href="/employee/leave/new" className="btn-primary">
          + Apply for leave
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No leave balances yet"
          hint={`Balances for ${year} appear here once your organisation sets up your leave entitlements.`}
        />
      ) : (
        <>
          {/* ── One card per leave type ── */}
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((r) => (
              <div key={r.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dotColour(r.colour) }}
                    />
                    <h3 className="text-sm font-semibold text-slate-800">{r.name}</h3>
                    {!r.isPaid && <Badge tone="slate">Unpaid</Badge>}
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-violet-700">
                    {r.available.toFixed(1)}
                    {suffix(r.unit)} left
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      Entitlement
                    </div>
                    <div className="text-[13px] font-medium tabular-nums text-slate-800">
                      {r.entitlement.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      Carried over
                    </div>
                    <div className="text-[13px] font-medium tabular-nums text-slate-800">
                      {r.carriedOver.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Taken</div>
                    <div className="text-[13px] font-medium tabular-nums text-slate-800">
                      {r.taken.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Pending</div>
                    <div className="text-[13px] font-medium tabular-nums text-slate-800">
                      {r.pending.toFixed(1)}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <ProgressBar
                    value={r.usedPct}
                    max={100}
                    tone="violet"
                    label={`${(r.taken + r.pending).toFixed(1)} of ${r.pool.toFixed(1)}${suffix(r.unit)} used`}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* ── Charts ── */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ChartPanel title="Remaining by leave type" subtitle={`Days left · ${year}`}>
              <BarList items={remainingItems} valueFormat={(v) => `${v.toFixed(1)}d`} showPercents={false} />
            </ChartPanel>

            <ChartPanel title="Taken vs remaining" subtitle={`Across all leave types · ${year}`}>
              <Donut
                segments={takenSegments}
                size={148}
                thickness={18}
                centerValue={totalRemaining.toFixed(1)}
                centerLabel="days remaining"
              />
            </ChartPanel>
          </div>
        </>
      )}
    </div>
  );
}
