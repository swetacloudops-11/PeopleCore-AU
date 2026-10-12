import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext, qs, intParam, strParam } from "@/lib/employee";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment, type Tone } from "@/components/charts";
import { formatDate } from "@/lib/format";
import { LeaveCancel } from "./LeaveCancel";

const PAGE_SIZE = 20;

const STATUS_CHIPS = ["ALL", "PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

/** Badge tones (separate from chart tones). */
const STATUS_TONE: Record<string, string> = {
  DRAFT: "blue",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
};

/** Chart palette — distinct from Badge tones. */
const CHART_TONE: Record<string, Tone> = {
  DRAFT: "sky",
  PENDING: "amber",
  APPROVED: "emerald",
  REJECTED: "rose",
  CANCELLED: "slate",
};

/** Coloured pill for a leave type, tinted from its configured colour. */
function TypePill({ name, colour }: { name: string; colour: string }) {
  if (!/^#[0-9a-fA-F]{6}$/.test(colour)) {
    return <span className="text-[13px] text-slate-600">{name}</span>;
  }
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${colour}1f`, color: colour }}
    >
      {name}
    </span>
  );
}

export default async function MyLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { employee, organisationId } = await employeeContext();

  const status = (strParam(sp.status) || "ALL").toUpperCase();
  const page = intParam(sp.page, 1);
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);

  const where = {
    employeeId: employee.id,
    organisationId,
    ...(status !== "ALL" ? { status: status as never } : {}),
  };

  const [allCount, pendingCount, approvedAgg, statusCounts, totalRows, requests] =
    await Promise.all([
      prisma.leaveRequest.count({
        where: { employeeId: employee.id, organisationId },
      }),
      prisma.leaveRequest.count({
        where: { employeeId: employee.id, organisationId, status: "PENDING" },
      }),
      prisma.leaveRequest.aggregate({
        _sum: { days: true },
        where: {
          employeeId: employee.id,
          organisationId,
          status: "APPROVED",
          startDate: { gte: yearStart },
        },
      }),
      prisma.leaveRequest.groupBy({
        by: ["status"],
        where: { employeeId: employee.id, organisationId },
        _count: true,
      }),
      prisma.leaveRequest.count({ where }),
      prisma.leaveRequest.findMany({
        where,
        orderBy: [{ appliedAt: "desc" }, { startDate: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { leaveType: { select: { name: true, colour: true } } },
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const approvedDays = Number(approvedAgg._sum.days ?? 0);

  const statusSegments = (statusCounts
    .map((s) => ({
      label: s.status,
      value: s._count,
      tone: CHART_TONE[s.status] ?? "slate",
    }))
    .sort((a, b) => b.value - a.value)) as DonutSegment[];

  const pageHref = (overrides: Record<string, string | number | undefined>) =>
    `/employee/leave${qs({ status, page, ...overrides })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            My Leave Requests
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {employee.firstName} {employee.lastName} · {allCount} request
            {allCount === 1 ? "" : "s"} on record
          </p>
        </div>
        <Link href="/employee/leave/new" className="btn-primary">
          + Apply for leave
        </Link>
      </div>

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Total requests" value={allCount} hint="All time" tone="indigo" />
        <StatCard
          label="Pending"
          value={pendingCount}
          hint={pendingCount ? "Awaiting manager review" : "Nothing waiting"}
          tone={pendingCount ? "amber" : "emerald"}
        />
        <StatCard
          label="Approved days"
          value={approvedDays.toFixed(1)}
          hint={`Approved leave starting in ${year}`}
          tone="emerald"
        />
      </div>

      {/* ── Status mix + shortcuts ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Requests by status" subtitle="Every request you have submitted">
          <Donut
            segments={statusSegments}
            size={136}
            thickness={16}
            centerValue={allCount}
            centerLabel="requests"
          />
        </ChartPanel>

        <div className="card p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-800">Leave shortcuts</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Everything about your time off, in one place.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { label: "Apply for leave", icon: "➕", href: "/employee/leave/new" },
              { label: "Request status", icon: "📌", href: "/employee/leave/status" },
              { label: "My balance", icon: "⚖️", href: "/employee/leave/balance" },
              { label: "Leave history", icon: "🕘", href: "/employee/leave/history" },
            ].map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
              >
                <span className="mr-1.5">{t.icon}</span>
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        {STATUS_CHIPS.map((s) => {
          const activeChip = status === s;
          return (
            <Link
              key={s}
              href={pageHref({ status: s, page: 1 })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeChip ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s}
            </Link>
          );
        })}
      </div>

      {/* ── Requests table ── */}
      <div className="mt-4">
        {requests.length === 0 ? (
          <EmptyState
            title="No leave requests here yet"
            hint={
              status === "ALL"
                ? "Apply for leave and your requests will appear here."
                : "Try a different status filter to see more requests."
            }
          />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Type</th>
                  <th className="th">Dates</th>
                  <th className="th">Days</th>
                  <th className="th">Status</th>
                  <th className="th">Applied</th>
                  <th className="th">Review notes</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <TypePill name={r.leaveType.name} colour={r.leaveType.colour} />
                    </td>
                    <td className="td whitespace-nowrap text-slate-600">
                      {formatDate(r.startDate)} → {formatDate(r.endDate)}
                    </td>
                    <td className="td tabular-nums text-slate-700">{Number(r.days).toFixed(1)}</td>
                    <td className="td">
                      <Badge tone={STATUS_TONE[r.status] ?? "slate"}>{r.status}</Badge>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDate(r.appliedAt)}</td>
                    <td className="td max-w-[220px] text-slate-500">
                      {r.reviewedAt ? (r.reviewNotes ?? "—") : "—"}
                    </td>
                    <td className="td text-right">
                      {r.status === "PENDING" ? (
                        <LeaveCancel id={r.id} />
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {/* ── Pagination ── */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} of{" "}
                {totalRows}
                {status !== "ALL" ? " (filtered)" : ""}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={pageHref({ page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                    ← Previous
                  </Link>
                ) : (
                  <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                    ← Previous
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link href={pageHref({ page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                    Next →
                  </Link>
                ) : (
                  <span className="btn-secondary pointer-events-none !py-1.5 text-xs opacity-50">
                    Next →
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
