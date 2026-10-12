import { prisma } from "@/lib/prisma";
import { orgContext, strParam } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import PublishRoster from "./Actions";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  DRAFT: "amber",
  PUBLISHED: "green",
  LOCKED: "blue",
  ARCHIVED: "slate",
};

export default async function PublishRostersPage({
  searchParams,
}: {
  searchParams: Promise<{ roster?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();
  const focus = strParam(sp.roster);

  const rosters = await prisma.roster.findMany({
    where: { organisationId },
    orderBy: { weekStart: "desc" },
    include: {
      _count: { select: { shifts: true } },
      conflicts: { where: { resolved: false }, select: { severity: true } },
    },
  });

  // Roster keeps publishedById without a relation, so resolve names separately.
  const publisherIds = rosters
    .map((r) => r.publishedById)
    .filter((v): v is string => Boolean(v));
  const publishers = publisherIds.length
    ? await prisma.user.findMany({
        where: { id: { in: publisherIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const publisherMap = new Map(publishers.map((u) => [u.id, u.name || u.email]));

  const drafts = rosters.filter((r) => r.status === "DRAFT");
  const published = rosters.filter((r) => r.status !== "DRAFT");
  const pendingShifts = drafts.reduce((sum, r) => sum + r._count.shifts, 0);
  const openConflicts = rosters.reduce(
    (sum, r) => sum + r.conflicts.filter((c) => c.severity !== "INFO").length,
    0
  );

  const byFocus = <T extends { id: string }>(list: T[]) =>
    focus ? [...list].sort((a, b) => Number(b.id === focus) - Number(a.id === focus)) : list;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Publish rosters
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · push draft rosters live so employees can see their shifts
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Draft rosters" value={drafts.length} hint="Not yet published" tone={drafts.length ? "amber" : "emerald"} />
        <StatCard label="Unpublished shifts" value={pendingShifts} hint="Waiting in drafts" tone={pendingShifts ? "sky" : "emerald"} />
        <StatCard label="Published rosters" value={published.length} hint="Live for employees" tone="emerald" />
        <StatCard label="Open conflicts" value={openConflicts} hint="Resolve before publishing" tone={openConflicts ? "rose" : "emerald"} />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Draft rosters <span className="font-normal text-slate-400">({drafts.length})</span>
        </h2>
        {drafts.length === 0 ? (
          <EmptyState
            title="No draft rosters"
            hint="Every roster is published — create a new week from Create Shifts."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Roster</th>
                <th className="th">Week</th>
                <th className="th">Shifts</th>
                <th className="th">Open conflicts</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byFocus(drafts).map((r) => {
                const errors = r.conflicts.filter((c) => c.severity === "ERROR").length;
                const warnings = r.conflicts.filter((c) => c.severity === "WARNING").length;
                return (
                  <tr
                    key={r.id}
                    className={
                      r.id === focus
                        ? "bg-indigo-50/60"
                        : "hover:bg-slate-50/70"
                    }
                  >
                    <td className="td font-medium text-slate-800">{r.name}</td>
                    <td className="td text-slate-500">
                      {formatDate(r.weekStart)} → {formatDate(r.weekEnd)}
                    </td>
                    <td className="td tabular-nums">{r._count.shifts}</td>
                    <td className="td">
                      <div className="flex gap-1.5">
                        {errors > 0 && <Badge tone="red">{errors} error{errors === 1 ? "" : "s"}</Badge>}
                        {warnings > 0 && <Badge tone="amber">{warnings} warning{warnings === 1 ? "" : "s"}</Badge>}
                        {r.conflicts.length === 0 && <span className="text-slate-400">None</span>}
                      </div>
                    </td>
                    <td className="td">
                      <Badge tone={TONE[r.status] ?? "slate"}>{r.status}</Badge>
                    </td>
                    <td className="td">
                      <div className="flex justify-end">
                        <PublishRoster
                          roster={{
                            id: r.id,
                            name: r.name,
                            shiftCount: r._count.shifts,
                            conflictCount: r.conflicts.length,
                            status: r.status,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Published rosters <span className="font-normal text-slate-400">({published.length})</span>
        </h2>
        {published.length === 0 ? (
          <EmptyState title="Nothing published yet" />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Roster</th>
                <th className="th">Week</th>
                <th className="th">Shifts</th>
                <th className="th">Status</th>
                <th className="th">Published</th>
                <th className="th">Published by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byFocus(published).map((r) => (
                <tr key={r.id} className={r.id === focus ? "bg-indigo-50/60" : "hover:bg-slate-50/70"}>
                  <td className="td font-medium text-slate-800">{r.name}</td>
                  <td className="td text-slate-500">
                    {formatDate(r.weekStart)} → {formatDate(r.weekEnd)}
                  </td>
                  <td className="td tabular-nums">{r._count.shifts}</td>
                  <td className="td">
                    <Badge tone={TONE[r.status] ?? "slate"}>{r.status}</Badge>
                  </td>
                  <td className="td text-slate-500">
                    {r.publishedAt ? formatDateTime(r.publishedAt) : "—"}
                  </td>
                  <td className="td text-slate-500">
                    {r.publishedById
                      ? publisherMap.get(r.publishedById) ?? "Administrator"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}
