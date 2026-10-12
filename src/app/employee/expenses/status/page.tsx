import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge, EmptyState } from "@/components/ui";
import { ChartPanel, StackedBar, type DonutSegment, type Tone } from "@/components/charts";
import { formatDate, formatMoney } from "@/lib/format";

const STATUS_CARDS = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "REIMBURSED"] as const;

type StatusKey = (typeof STATUS_CARDS)[number];

const STATUS_TONE: Record<StatusKey, string> = {
  DRAFT: "blue",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  REIMBURSED: "purple",
};

/** Prominent badge classes for the pipeline view. */
const BIG_BADGE: Record<StatusKey, string> = {
  DRAFT: "bg-sky-100 text-sky-700",
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
  REIMBURSED: "bg-violet-100 text-violet-700",
};

const CARD_HINT: Record<StatusKey, string> = {
  DRAFT: "Withdrawn — resubmit to send",
  PENDING: "With your approver",
  APPROVED: "Approved — awaiting payment",
  REJECTED: "Declined — check the notes",
  REIMBURSED: "Paid back to you",
};

/** Chart tones — distinct from Badge tones. */
const CHART_TONE: Record<StatusKey, Tone> = {
  DRAFT: "slate",
  PENDING: "amber",
  APPROVED: "emerald",
  REJECTED: "rose",
  REIMBURSED: "teal",
};

export default async function ClaimStatusPage() {
  const { employee, organisationId } = await employeeContext();

  const [statusCounts, recent] = await Promise.all([
    prisma.expense.groupBy({
      by: ["status"],
      where: { employeeId: employee.id, organisationId },
      _count: true,
    }),
    prisma.expense.findMany({
      where: { employeeId: employee.id, organisationId },
      orderBy: [{ submittedAt: { sort: "desc", nulls: "last" } }, { expenseDate: "desc" }],
      take: 10,
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
            Claim Status
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {employee.firstName}, here is where each claim sits in the pipeline.
          </p>
        </div>
        <Link href="/employee/expenses/new" className="btn-primary">
          + New claim
        </Link>
      </div>

      {/* ── One card per pipeline stage ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
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
        {/* ── 10 most recent claims ── */}
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Most recent claims</h2>
            <Link href="/employee/expenses" className="text-xs text-violet-600 hover:underline">
              All claims →
            </Link>
          </div>

          {recent.length === 0 ? (
            <EmptyState
              title="No expense claims yet"
              hint="Submit a claim and its pipeline status will appear here."
            />
          ) : (
            <div className="card divide-y divide-slate-100">
              {recent.map((c) => (
                <div key={c.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-slate-800">{c.category}</span>
                        <span className="text-[13px] font-semibold tabular-nums text-slate-700">
                          {formatMoney(Number(c.amount), c.currency)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          · {formatDate(c.expenseDate)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{c.description}</p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                        BIG_BADGE[c.status as StatusKey] ?? BIG_BADGE.DRAFT
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  {c.reviewedAt && (
                    <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs leading-snug text-slate-600">
                      <span className="font-medium text-slate-500">Reviewer note:</span>{" "}
                      {c.reviewNotes ?? "—"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Pipeline mix ── */}
        <div className="space-y-4">
          <ChartPanel title="All my claims" subtitle={`${total} by pipeline stage`}>
            <StackedBar segments={segments} height={14} />
          </ChartPanel>

          <div className="card p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-800">Related pages</h3>
            <div className="mt-3 space-y-2">
              {[
                { label: "Submit a claim", icon: "💳", href: "/employee/expenses/new" },
                { label: "My expense claims", icon: "🧾", href: "/employee/expenses" },
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
