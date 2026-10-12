import Link from "next/link";
import { ReviewStatus, ReviewType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, TableWrap, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import ReviewActions, { NewReviewButton } from "./ReviewActions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const STATUS_TONES: Record<string, string> = {
  DRAFT: "slate",
  IN_PROGRESS: "blue",
  COMPLETED: "green",
  CANCELLED: "red",
};

const TYPE_TONES: Record<string, string> = {
  ANNUAL: "purple",
  PROBATION: "amber",
  QUARTERLY: "blue",
  MID_YEAR: "green",
  CUSTOM: "slate",
};

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const { organisationId } = await orgContext();

  const status = parseEnum(ReviewStatus, one(sp.status));
  const type = parseEnum(ReviewType, one(sp.type));
  const emp = strParam(one(sp.emp));
  const q = strParam(one(sp.q));
  const page = intParam(one(sp.page), 1, 500);

  const where = {
    organisationId,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(emp ? { employeeId: emp } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { employee: { firstName: { contains: q, mode: "insensitive" as const } } },
            { employee: { lastName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [reviews, reviewCount, completed, inFlight, ratingAgg, employees] =
    await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
          reviewer: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.review.count({ where }),
      prisma.review.count({ where: { organisationId, status: "COMPLETED" } }),
      prisma.review.count({
        where: { organisationId, status: { in: ["DRAFT", "IN_PROGRESS"] } },
      }),
      prisma.review.aggregate({
        where: { organisationId, status: "COMPLETED", overallRating: { not: null } },
        _avg: { overallRating: true },
      }),
      prisma.employee.findMany({
        where: { organisationId },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          _count: { select: { reports: true } },
        },
      }),
    ]);

  const avgRating = ratingAgg._avg.overallRating
    ? Number(ratingAgg._avg.overallRating)
    : null;
  const totalPages = Math.max(1, Math.ceil(reviewCount / PAGE_SIZE));
  const filters = {
    status: status || undefined,
    type: type || undefined,
    emp: emp || undefined,
    q: q || undefined,
  };
  const employeeOptions = employees.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName}`,
    isManager: e._count.reports > 0,
  }));

  return (
    <div>
      <PageHeader
        title="Reviews"
        subtitle="Annual, probation and quarterly reviews across the organisation."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total reviews" value={reviewCount} hint="Matching filters" tone="indigo" />
        <StatCard label="Completed" value={completed} hint="Rated and closed" tone="emerald" />
        <StatCard label="Open reviews" value={inFlight} hint="Draft or in progress" tone={inFlight ? "amber" : "emerald"} />
        <StatCard
          label="Average rating"
          value={avgRating ? `${avgRating.toFixed(2)} / 5` : "—"}
          hint="Completed reviews only"
          tone="sky"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "All", value: "" },
            { label: "Draft", value: "DRAFT" },
            { label: "In progress", value: "IN_PROGRESS" },
            { label: "Completed", value: "COMPLETED" },
            { label: "Cancelled", value: "CANCELLED" },
          ].map((s) => (
            <Link
              key={s.label}
              href={qs({ ...filters, status: s.value, page: 1 })}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                (status ?? "") === s.value
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>

        <form className="flex flex-wrap items-center gap-2" method="get">
          <input type="hidden" name="status" value={status ?? ""} />
          <input name="q" key={`q-${q}`} defaultValue={q} placeholder="Search reviews…" className="input !w-44" />
          <select name="type" key={`t-${type}`} defaultValue={type ?? ""} className="input !w-40">
            <option value="">Any type</option>
            {(["ANNUAL", "PROBATION", "QUARTERLY", "MID_YEAR", "CUSTOM"] as const).map((t) => (
              <option key={t} value={t}>
                {pretty(t)}
              </option>
            ))}
          </select>
          <select name="emp" key={`e-${emp}`} defaultValue={emp} className="input !w-48">
            <option value="">Any employee</option>
            {employeeOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">
            Filter
          </button>
        </form>
      </div>

      <div className="mb-3 flex justify-end">
        <NewReviewButton employees={employeeOptions} />
      </div>

      {reviews.length === 0 ? (
        <EmptyState
          title="No reviews match these filters"
          hint="Create a new review or clear the filters."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Employee</th>
              <th className="th">Reviewer</th>
              <th className="th">Type</th>
              <th className="th">Title</th>
              <th className="th">Period</th>
              <th className="th">Due</th>
              <th className="th">Status</th>
              <th className="th">Rating</th>
              <th className="th">Completed</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reviews.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <td className="td">
                  <Link
                    href={`/org/performance/reviews/${r.id}`}
                    className="font-medium text-slate-800 hover:text-indigo-600 hover:underline"
                  >
                    {r.employee.firstName} {r.employee.lastName}
                  </Link>
                  <div className="text-xs text-slate-400">{r.employee.employeeNumber}</div>
                </td>
                <td className="td text-slate-600">
                  {r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : "—"}
                </td>
                <td className="td">
                  <Badge tone={TYPE_TONES[r.type] ?? "slate"}>{pretty(r.type)}</Badge>
                </td>
                <td className="td text-slate-700">{r.title}</td>
                <td className="td whitespace-nowrap text-slate-500">
                  {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                </td>
                <td className="td whitespace-nowrap text-slate-500">
                  {r.dueDate ? formatDate(r.dueDate) : "—"}
                </td>
                <td className="td">
                  <Badge tone={STATUS_TONES[r.status] ?? "slate"}>{pretty(r.status)}</Badge>
                </td>
                <td className="td whitespace-nowrap text-slate-700">
                  {r.overallRating ? (
                    <>
                      <span className="font-semibold">{Number(r.overallRating).toFixed(1)}</span>
                      <span className="text-xs text-slate-400"> / 5</span>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="td whitespace-nowrap text-slate-500">
                  {r.completedAt ? formatDate(r.completedAt) : "—"}
                </td>
                <td className="td text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/org/performance/reviews/${r.id}`}
                      className="text-[11px] font-medium text-indigo-600 hover:underline"
                    >
                      View
                    </Link>
                    <ReviewActions id={r.id} status={r.status} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {reviewCount > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages} · {reviewCount} reviews
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ ...filters, page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={qs({ ...filters, page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
