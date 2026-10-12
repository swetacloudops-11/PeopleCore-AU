import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge, EmptyState, TableWrap } from "@/components/ui";
import { formatDate, timeAgo } from "@/lib/format";
import SwapRequestForm from "./SwapRequestForm";
import SwapCancel from "./SwapCancel";

const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

/** Badge tone per SwapStatus (Badge palette only). */
const SWAP_TONE: Record<string, string> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
};

/** "Fri 12 Feb" in the same terms the shift's date is displayed everywhere. */
const dayLabel = (d: Date): string => {
  const weekday = d.toLocaleDateString("en-AU", { weekday: "short" });
  const month = d.toLocaleDateString("en-AU", { month: "short" });
  return `${weekday} ${d.getDate()} ${month}`;
};

export default async function SwapRequestsPage() {
  const { employee, organisationId, org } = await employeeContext();
  const today = D(0);

  const [swapShifts, teammates, requests] = await Promise.all([
    prisma.shift.findMany({
      where: {
        employeeId: employee.id,
        organisationId,
        date: { gte: today },
        status: { in: ["SCHEDULED", "CONFIRMED"] },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 30,
      select: { id: true, date: true, startTime: true, endTime: true },
    }),
    prisma.employee.findMany({
      where: {
        organisationId,
        employmentStatus: { not: "TERMINATED" },
        NOT: { id: employee.id },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 100,
    }),
    prisma.shiftSwapRequest.findMany({
      where: { organisationId, requestedById: employee.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        shift: { include: { location: { select: { name: true } } } },
        offeredTo: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  // Plain serialisable options for the client form.
  const shiftOptions = swapShifts.map((s) => ({
    id: s.id,
    label: `${dayLabel(s.date)} · ${s.startTime}–${s.endTime}`,
  }));
  const teammateOptions = teammates.map((t) => ({
    id: t.id,
    name: `${t.firstName} ${t.lastName}`,
  }));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {org.name} · {employee.firstName} {employee.lastName}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Shift Swaps
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Request a swap on one of your shifts and track your requests
          </p>
        </div>
        <Link href="/employee/roster" className="btn-secondary">
          My Schedule
        </Link>
      </div>

      <div className="space-y-6">
        {/* ── (a) Request a swap ── */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Request a swap</h2>
          {shiftOptions.length === 0 ? (
            <EmptyState
              title="No upcoming shifts to swap"
              hint="You can request a swap once you have a scheduled or confirmed shift in the future."
            />
          ) : (
            <div className="card p-4 sm:p-5">
              <SwapRequestForm shifts={shiftOptions} teammates={teammateOptions} />
            </div>
          )}
        </section>

        {/* ── (b) My swap requests ── */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">My swap requests</h2>
          {requests.length === 0 ? (
            <EmptyState
              title="No swap requests yet"
              hint="Requests you make will appear here with their review status."
            />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Shift</th>
                  <th className="th">Offered to</th>
                  <th className="th">Reason</th>
                  <th className="th">Status</th>
                  <th className="th">Review notes</th>
                  <th className="th">Requested</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="td whitespace-nowrap">
                      <Link
                        href={`/employee/shifts/${r.shiftId}`}
                        className="font-medium text-slate-800 hover:text-violet-600 hover:underline"
                      >
                        {formatDate(r.shift.date)} · {r.shift.startTime}–{r.shift.endTime}
                      </Link>
                      <div className="text-[11px] text-slate-400">
                        {r.shift.location?.name ?? "Location TBA"}
                      </div>
                    </td>
                    <td className="td text-slate-600">
                      {r.offeredTo
                        ? `${r.offeredTo.firstName} ${r.offeredTo.lastName}`
                        : "No preference"}
                    </td>
                    <td className="td max-w-52 text-slate-600">
                      {r.reason ? (
                        <span className="line-clamp-2 text-xs">{r.reason}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="td">
                      <Badge tone={SWAP_TONE[r.status] ?? "slate"}>
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="td max-w-52 text-slate-600">
                      {r.reviewNotes ? (
                        <span className="line-clamp-2 text-xs">{r.reviewNotes}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {timeAgo(r.createdAt)}
                    </td>
                    <td className="td text-right">
                      {r.status === "PENDING" && <SwapCancel requestId={r.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </section>
      </div>
    </div>
  );
}
