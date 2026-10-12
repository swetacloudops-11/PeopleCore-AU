import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge, EmptyState } from "@/components/ui";
import { ChartPanel, StackedBar, type DonutSegment, type Tone } from "@/components/charts";
import { formatDate } from "@/lib/format";

const STATUS_CARDS = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

type StatusKey = (typeof STATUS_CARDS)[number] | "DRAFT";

const STATUS_TONE: Record<StatusKey, string> = {
  DRAFT: "blue",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
};

/** Prominent badge classes for the status-centred view. */
const BIG_BADGE: Record<StatusKey, string> = {
  DRAFT: "bg-sky-100 text-sky-700",
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-slate-100 text-slate-600",
};

const CARD_HINT: Record<(typeof STATUS_CARDS)[number], string> = {
  PENDING: "Waiting on your manager",
  APPROVED: "Locked in — enjoy",
  REJECTED: "Declined — check the notes",
  CANCELLED: "Withdrawn by you",
};

/** Chart tones — distinct from Badge tones. */
const CHART_TONE: Record<StatusKey, Tone> = {
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

export default async function LeaveStatusPage() {
  const { employee, organisationId } = await employeeContext();

  const [statusCounts, recent] = await Promise.all([
    prisma.leaveRequest.groupBy({
      by: ["status"],
      where: { employeeId: employee.id, organisationId },
      _count: true,
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: employee.id, organisationId },
      orderBy: [{ appliedAt: "desc" }, { startDate: "desc" }],
      take: 10,
      include: { leaveType: { select: { name: true, colour: true } } },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const s of statusCounts) counts[s.status] = s._count;
  const total = statusCounts.reduce((a, s) => a + s._count, 0);

  const segments = (STATUS_CARDS.map((s) => ({
    label: s,
    value: counts[s] ?? 0,
    tone: CHART_TONE[s],
  })) as DonutSegment[]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Leave Request Status
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {employee.firstName}, here is where every request stands.
          </p>
        </div>
        <Link href="/employee/leave/new" className="btn-primary">
          + Apply for leave
        </Link>
      </div>

      {/* ── One summary card per status ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {STATUS_CARDS.map((s) => (
          <div key={s} className="card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {s}
              </span>
              <Badge tone={STATUS_TONE[s]}>{s}</Badge>
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{counts[s] ?? 0}</div>
            <div className="mt-1 text-xs text-slate-500">{CARD_HINT[s]}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* ── 10 most recent requests ── */}
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Most recent requests</h2>
            <Link href="/employee/leave" className="text-xs text-violet-600 hover:underline">
              All requests →
            </Link>
          </div>

          {recent.length === 0 ? (
            <EmptyState
              title="No leave requests yet"
              hint="Apply for leave and its status will appear here."
            />
          ) : (
            <div className="card divide-y divide-slate-100">
              {recent.map((r) => (
                <div key={r.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypePill name={r.leaveType.name} colour={r.leaveType.colour} />
                      <span className="text-[13px] font-medium text-slate-800">
                        {formatDate(r.startDate)} → {formatDate(r.endDate)}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        · {Number(r.days).toFixed(1)}d · applied {formatDate(r.appliedAt)}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                        BIG_BADGE[r.status as StatusKey] ?? BIG_BADGE.DRAFT
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  {r.reviewedAt && (
                    <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs leading-snug text-slate-600">
                      <span className="font-medium text-slate-500">Reviewer note:</span>{" "}
                      {r.reviewNotes ?? "—"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Status mix ── */}
        <div className="space-y-4">
          <ChartPanel title="All my requests" subtitle={`${total} by status`}>
            <StackedBar segments={segments} height={14} />
          </ChartPanel>

          <div className="card p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-800">Related pages</h3>
            <div className="mt-3 space-y-2">
              {[
                { label: "My leave balance", icon: "⚖️", href: "/employee/leave/balance" },
                { label: "Leave history", icon: "🕘", href: "/employee/leave/history" },
                { label: "Apply for leave", icon: "➕", href: "/employee/leave/new" },
              ].map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className="block rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
                >
                  <span className="mr-1.5">{t.icon}</span>
                  {t.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
