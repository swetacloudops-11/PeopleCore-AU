import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import { Badge } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";

/** Badge tone per ShiftStatus (Badge palette only). */
const SHIFT_TONE: Record<string, string> = {
  SCHEDULED: "blue",
  CONFIRMED: "green",
  SWAP_REQUESTED: "purple",
  SWAPPED: "purple",
  CANCELLED: "red",
  COMPLETED: "slate",
  MISSED: "amber",
};

/** Badge tone per SwapStatus (Badge palette only). */
const SWAP_TONE: Record<string, string> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
};

/** Badge tone per RosterStatus (Badge palette only). */
const ROSTER_TONE: Record<string, string> = {
  DRAFT: "slate",
  PUBLISHED: "green",
  LOCKED: "blue",
  ARCHIVED: "amber",
};

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value}</dd>
    </div>
  );
}

export default async function ShiftDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { employee, organisationId } = await employeeContext();

  // Scoped to the signed-in person — anyone else's shift id 404s.
  const shift = await prisma.shift.findFirst({
    where: { id, employeeId: employee.id, organisationId },
    include: {
      location: {
        select: { name: true, addressLine1: true, city: true, state: true, postcode: true },
      },
      roster: { select: { name: true, weekStart: true, weekEnd: true, status: true } },
      swapRequests: {
        where: { requestedById: employee.id },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { offeredTo: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (!shift) notFound();

  const swap = shift.swapRequests[0] ?? null;
  const address =
    [
      shift.location?.addressLine1,
      shift.location?.city,
      shift.location?.state,
      shift.location?.postcode,
    ]
      .filter(Boolean)
      .join(", ") || null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/employee/roster"
            className="text-xs font-medium text-violet-600 hover:underline"
          >
            ← Back to schedule
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            {shift.date.toLocaleDateString("en-AU", { weekday: "long" })}{" "}
            {formatDate(shift.date)}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {shift.startTime}–{shift.endTime} · {shift.location?.name ?? "Location TBA"}
          </p>
        </div>
        <Link href="/employee/roster/swaps" className="btn-primary">
          Request swap
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── When ── */}
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">When</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Info label="Date" value={formatDate(shift.date)} />
            <Info
              label="Time"
              value={
                <span className="tabular-nums">
                  {shift.startTime}–{shift.endTime}
                </span>
              }
            />
            <Info
              label="Break"
              value={shift.breakMinutes > 0 ? `${shift.breakMinutes}m` : "No break"}
            />
            <Info
              label="Hours"
              value={<span className="tabular-nums">{Number(shift.hours).toFixed(1)}</span>}
            />
            <Info
              label="Overtime"
              value={
                shift.isOvertime ? <Badge tone="amber">Overtime</Badge> : <span>—</span>
              }
            />
            <Info label="Role" value={shift.roleLabel ?? "—"} />
          </dl>
        </div>

        {/* ── Where & roster ── */}
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Where &amp; roster</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Info label="Location" value={shift.location?.name ?? "—"} />
            <Info label="Address" value={address ?? "—"} />
            <Info
              label="Roster"
              value={
                shift.roster ? (
                  <span className="inline-flex items-center gap-1.5">
                    {shift.roster.name}
                    <Badge tone={ROSTER_TONE[shift.roster.status] ?? "slate"}>
                      {shift.roster.status}
                    </Badge>
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <Info
              label="Roster week"
              value={
                shift.roster
                  ? `${formatDate(shift.roster.weekStart)} – ${formatDate(shift.roster.weekEnd)}`
                  : "—"
              }
            />
            <Info
              label="Published"
              value={shift.publishedAt ? formatDateTime(shift.publishedAt) : "—"}
            />
          </dl>
        </div>

        {/* ── Status, notes & swap ── */}
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Status &amp; notes</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Info
              label="Status"
              value={
                <Badge tone={SHIFT_TONE[shift.status] ?? "slate"}>
                  {shift.status.replace(/_/g, " ")}
                </Badge>
              }
            />
            <Info
              label="Swap request"
              value={
                swap ? (
                  <Badge tone={SWAP_TONE[swap.status] ?? "slate"}>
                    {swap.status.replace(/_/g, " ")}
                  </Badge>
                ) : (
                  "No swap requested"
                )
              }
            />
          </dl>
          {swap && (
            <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
              {swap.offeredTo && (
                <p>
                  <span className="font-medium text-slate-700">Offered to:</span>{" "}
                  {swap.offeredTo.firstName} {swap.offeredTo.lastName}
                </p>
              )}
              {swap.reason && (
                <p>
                  <span className="font-medium text-slate-700">Your reason:</span>{" "}
                  {swap.reason}
                </p>
              )}
              {swap.reviewNotes && (
                <p>
                  <span className="font-medium text-slate-700">Manager notes:</span>{" "}
                  {swap.reviewNotes}
                </p>
              )}
              <p className="mt-1 text-slate-400">
                Manage it on the{" "}
                <Link
                  href="/employee/roster/swaps"
                  className="font-medium text-violet-600 hover:underline"
                >
                  shift swaps
                </Link>{" "}
                page.
              </p>
            </div>
          )}
          <div className="mt-4">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Notes
            </dt>
            <dd className="mt-0.5 whitespace-pre-line text-sm text-slate-700">
              {shift.notes ?? "No notes for this shift"}
            </dd>
          </div>
        </div>
      </div>
    </div>
  );
}
