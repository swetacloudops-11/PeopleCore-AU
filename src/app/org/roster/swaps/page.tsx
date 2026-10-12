import Link from "next/link";
import { SwapStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgContext, qs, intParam, strParam } from "@/lib/org";
import { parseEnum } from "@/lib/enums";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import SwapActions from "./Actions";

export const dynamic = "force-dynamic";

const PAGE = 25;

const STATUS_TONE: Record<string, string> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
};

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];

export default async function SwapsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await orgContext();

  const q = strParam(sp.q);
  const page = intParam(sp.page, 1);
  const status = parseEnum(SwapStatus, sp.status);

  const where = {
    organisationId,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            {
              requestedBy: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" as const } },
                  { lastName: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
            {
              offeredTo: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" as const } },
                  { lastName: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [total, pending, rows, counts] = await Promise.all([
    prisma.shiftSwapRequest.count({ where }),
    prisma.shiftSwapRequest.count({ where: { organisationId, status: "PENDING" } }),
    prisma.shiftSwapRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        shift: {
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            status: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
        requestedBy: { select: { firstName: true, lastName: true, employeeNumber: true } },
        offeredTo: { select: { firstName: true, lastName: true, employeeNumber: true } },
      },
    }),
    prisma.shiftSwapRequest.groupBy({ by: ["status"], _count: true, where: { organisationId } }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = { q: q || undefined, page };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Shift swaps
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {org.name} · review employee shift swap requests
          </p>
        </div>
        <Link href={qs({ ...base, status: "PENDING", page: 1 })} className="btn-primary">
          ↔ {pending} pending request{pending === 1 ? "" : "s"}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Pending" value={pending} hint="Needs a decision" tone={pending ? "amber" : "emerald"} />
        <StatCard label="Approved" value={countMap.APPROVED ?? 0} hint="All time" tone="emerald" />
        <StatCard label="Rejected" value={countMap.REJECTED ?? 0} hint="All time" tone="rose" />
        <StatCard label="Total requests" value={totalAll} hint="All statuses" tone="indigo" />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {["ALL", ...STATUSES].map((s) => (
          <Link
            key={s}
            href={qs({ ...base, status: s === "ALL" ? undefined : s, page: 1 })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              (sp.status ?? "ALL") === s
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "ALL" ? "All" : s} · {s === "ALL" ? totalAll : countMap[s] ?? 0}
          </Link>
        ))}
      </div>

      <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="sw-q">Employee</label>
          <input
            id="sw-q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search requester or offered-to…"
          />
        </div>
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No swap requests found"
            hint="Employees raise swap requests from their own roster view."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Shift</th>
                <th className="th">Assigned to</th>
                <th className="th">Requested by</th>
                <th className="th">Offered to</th>
                <th className="th">Reason</th>
                <th className="th">Created</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="td font-medium text-slate-800">
                    {formatDate(s.shift.date)}
                    <div className="text-[11px] font-normal tabular-nums text-slate-400">
                      {s.shift.startTime} – {s.shift.endTime}
                    </div>
                  </td>
                  <td className="td text-slate-600">
                    {s.shift.employee.firstName} {s.shift.employee.lastName}
                  </td>
                  <td className="td text-slate-600">
                    {s.requestedBy.firstName} {s.requestedBy.lastName}
                    <span className="ml-1.5 text-[11px] text-slate-400">
                      {s.requestedBy.employeeNumber}
                    </span>
                  </td>
                  <td className="td text-slate-600">
                    {s.offeredTo ? (
                      <>
                        {s.offeredTo.firstName} {s.offeredTo.lastName}
                        <span className="ml-1.5 text-[11px] text-slate-400">
                          {s.offeredTo.employeeNumber}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">Open to anyone</span>
                    )}
                  </td>
                  <td className="td max-w-[14rem] truncate text-slate-500">{s.reason ?? "—"}</td>
                  <td className="td text-slate-500">{formatDateTime(s.createdAt)}</td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[s.status] ?? "slate"}>{s.status}</Badge>
                    {s.status === "APPROVED" && s.shift.status === "SWAPPED" && (
                      <div className="mt-0.5 text-[11px] text-violet-500">Shift swapped</div>
                    )}
                    {s.reviewNotes && (
                      <div className="mt-0.5 max-w-[14rem] truncate text-[11px] text-slate-400">
                        {s.reviewNotes}
                      </div>
                    )}
                  </td>
                  <td className="td">
                    <div className="flex justify-end">
                      <SwapActions
                        request={{
                          id: s.id,
                          status: s.status,
                          label: `${s.requestedBy.firstName} ${s.requestedBy.lastName} · ${formatDate(s.shift.date)} ${s.shift.startTime}–${s.shift.endTime}`,
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

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {pages} · {total} requests
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ ...base, page: page - 1 })} className="btn-secondary !py-1.5 text-xs">
                ← Previous
              </Link>
            )}
            {page < pages && (
              <Link href={qs({ ...base, page: page + 1 })} className="btn-secondary !py-1.5 text-xs">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
