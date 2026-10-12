import Link from "next/link";
import { ConflictType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, strParam } from "@/lib/org";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, BarList, type DonutSegment } from "@/components/charts";
import { formatDateTime, timeAgo } from "@/lib/format";
import ConflictToggle from "./Actions";

export const dynamic = "force-dynamic";

const SEVERITIES = [
  { key: "ERROR", label: "Errors", tone: "red", hint: "Blocks a clean publish" },
  { key: "WARNING", label: "Warnings", tone: "amber", hint: "Should be reviewed" },
  { key: "INFO", label: "Informational", tone: "blue", hint: "FYI only" },
] as const;

const TYPE_TONE: Record<string, string> = {
  OVERLAP: "red",
  LEAVE_CLASH: "red",
  AVAILABILITY: "purple",
  OVERTIME: "amber",
  UNFILLED: "blue",
  MISSING_BREAK: "slate",
};

const TYPES = [
  "OVERLAP",
  "LEAVE_CLASH",
  "AVAILABILITY",
  "OVERTIME",
  "UNFILLED",
  "MISSING_BREAK",
];

/** Chart equivalents of TYPE_TONE — Badge tones are not chart tones. */
const CONFLICT_TONE: Record<string, "rose" | "amber" | "violet" | "sky" | "slate"> = {
  OVERLAP: "rose",
  LEAVE_CLASH: "rose",
  AVAILABILITY: "violet",
  OVERTIME: "amber",
  UNFILLED: "sky",
  MISSING_BREAK: "slate",
};

const CONFLICT_LABEL: Record<string, string> = {
  OVERLAP: "Overlapping shifts",
  LEAVE_CLASH: "Leave clashes",
  AVAILABILITY: "Availability conflicts",
  OVERTIME: "Overtime breaches",
  UNFILLED: "Unfilled shifts",
  MISSING_BREAK: "Missing breaks",
};

export default async function ConflictsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; state?: string; roster?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const type = parseEnum(ConflictType, sp.type);
  const rosterId = strParam(sp.roster);
  const state = ["open", "resolved", "all"].includes(sp.state ?? "") ? sp.state! : "open";

  const scope = {
    organisationId,
    ...(rosterId ? { rosterId } : {}),
    ...(type ? { type } : {}),
    ...(state === "open" ? { resolved: false } : state === "resolved" ? { resolved: true } : {}),
  };

  const [conflicts, openErrors, openWarnings, resolvedCount, totalCount, byType] =
    await Promise.all([
    prisma.rosterConflict.findMany({
      where: scope,
      orderBy: { detectedAt: "desc" },
      take: 200,
      include: {
        roster: { select: { id: true, name: true, weekStart: true } },
        shift: { select: { id: true, date: true, startTime: true, endTime: true } },
      },
    }),
    prisma.rosterConflict.count({ where: { organisationId, resolved: false, severity: "ERROR" } }),
    prisma.rosterConflict.count({ where: { organisationId, resolved: false, severity: "WARNING" } }),
    prisma.rosterConflict.count({ where: { organisationId, resolved: true } }),
    prisma.rosterConflict.count({ where: { organisationId } }),
    prisma.rosterConflict.groupBy({
      by: ["type"],
      where: { organisationId, resolved: false },
      _count: true,
    }),
  ]);

  const groups = SEVERITIES.map((s) => ({
    ...s,
    items: conflicts.filter((c) => c.severity === s.key),
  })).filter((g) => g.items.length > 0);

  const base = {
    type: sp.type,
    state: sp.state,
    roster: rosterId || undefined,
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Roster conflicts
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · overlaps, leave clashes, availability and overtime issues
          </p>
        </div>
        <Link href="/org/roster" className="btn-secondary">← Back to calendar</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Open errors" value={openErrors} hint="Blocking issues" tone={openErrors ? "rose" : "emerald"} />
        <StatCard label="Open warnings" value={openWarnings} hint="Need review" tone={openWarnings ? "amber" : "emerald"} />
        <StatCard label="Resolved" value={resolvedCount} hint="Marked as handled" tone="emerald" />
        <StatCard label="Total conflicts" value={totalCount} hint="All time" tone="indigo" />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Severity mix" subtitle="Open vs resolved conflicts">
          <Donut
            segments={(
              [
                { label: "Open errors", value: openErrors, tone: "rose" },
                { label: "Open warnings", value: openWarnings, tone: "amber" },
                { label: "Resolved", value: resolvedCount, tone: "emerald" },
              ] as DonutSegment[]
            ).filter((s) => s.value > 0)}
            size={134}
            thickness={16}
            centerValue={totalCount}
            centerLabel="conflicts"
          />
        </ChartPanel>

        <ChartPanel title="Open issues by type" subtitle="What is blocking the roster">
          <BarList
            items={byType
              .map((t) => ({
                label: CONFLICT_LABEL[t.type] ?? t.type,
                value: t._count,
                tone: CONFLICT_TONE[t.type] ?? "amber",
              }))
              .sort((a, b) => b.value - a.value)}
            valueFormat={(v) => String(v)}
            showPercents={false}
          />
        </ChartPanel>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Show</span>
        {[
          { key: "", label: "Open" },
          { key: "resolved", label: "Resolved" },
          { key: "all", label: "All" },
        ].map((s) => {
          const active = (state === "open" ? "" : state) === s.key;
          return (
            <Link
              key={s.key}
              href={qs({ ...base, state: s.key || undefined })}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s.label}
            </Link>
          );
        })}

        <span className="ml-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Type</span>
        {["ALL", ...TYPES].map((t) => (
          <Link
            key={t}
            href={qs({ ...base, type: t === "ALL" ? undefined : t })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              (sp.type ?? "ALL") === t
                ? "bg-slate-800 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t === "ALL" ? "All types" : t.replace("_", " ")}
          </Link>
        ))}

        {rosterId && (
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
            One roster only ·{" "}
            <Link
              href={qs({ ...base, roster: undefined })}
              className="underline hover:text-indigo-900"
            >
              clear
            </Link>
          </span>
        )}
      </div>

      <div className="mt-5 space-y-6">
        {groups.length === 0 ? (
          <EmptyState
            title={
              state === "resolved"
                ? "No resolved conflicts yet"
                : state === "all"
                  ? "No conflicts found"
                  : "No open conflicts 🎉"
            }
            hint="Conflicts appear here when rosters overlap leave, availability or overtime rules."
          />
        ) : (
          groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-center gap-2">
                <Badge tone={g.tone}>{g.label}</Badge>
                <span className="text-xs text-slate-400">{g.hint}</span>
                <span className="ml-auto text-xs text-slate-400">{g.items.length}</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {g.items.map((c) => (
                  <div
                    key={c.id}
                    className={`card p-4 transition ${
                      c.resolved ? "opacity-60" : "hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={TYPE_TONE[c.type] ?? "slate"}>
                            {c.type.replace("_", " ")}
                          </Badge>
                          <span className="text-[11px] text-slate-400">{c.roster.name}</span>
                          {c.shift && (
                            <span className="text-[11px] tabular-nums text-slate-400">
                              {c.shift.startTime}–{c.shift.endTime}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm leading-snug text-slate-700">{c.message}</p>
                        <p className="mt-2 text-[11px] text-slate-400">
                          Detected {formatDateTime(c.detectedAt)} · {timeAgo(c.detectedAt)}
                        </p>
                      </div>
                      <ConflictToggle id={c.id} resolved={c.resolved} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {conflicts.length === 200 && (
        <p className="mt-4 text-xs text-slate-400">
          Showing the first 200 conflicts — narrow the filters to see the rest.
        </p>
      )}
    </div>
  );
}
