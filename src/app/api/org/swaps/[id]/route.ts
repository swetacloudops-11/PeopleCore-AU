import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  action: z.enum(["APPROVE", "REJECT", "CANCEL"]),
  notes: z.string().max(500).nullish(),
});

/**
 * PATCH /api/org/swaps/[id] — approve or reject a shift swap request.
 * Approving also moves the underlying shift to SWAPPED.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const { action, notes } = parsed.data;

  const row = await prisma.shiftSwapRequest.findUnique({
    where: { id },
    include: {
      shift: { select: { id: true, date: true, startTime: true, endTime: true, status: true } },
      requestedBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!row || row.organisationId !== organisationId) {
    return NextResponse.json({ error: "Swap request not found" }, { status: 404 });
  }
  if (row.status !== "PENDING") {
    return NextResponse.json(
      { error: `This request has already been ${row.status.toLowerCase()}` },
      { status: 409 }
    );
  }

  const status = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CANCELLED";
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.shiftSwapRequest.update({
      where: { id },
      data: {
        status,
        reviewedById: auth.ctx.session.id,
        reviewedAt: now,
        reviewNotes: notes ?? null,
      },
    });
    // Approving hands the shift across, so mark it as swapped.
    if (action === "APPROVE") {
      await tx.shift.update({ where: { id: row.shiftId }, data: { status: "SWAPPED" } });
    }
  });

  await writeOrgAudit({
    organisationId,
    action: `SWAP_${action}`,
    category: "Rostering",
    severity: action === "REJECT" ? "WARNING" : "INFO",
    description: `${action === "APPROVE" ? "Approved" : action === "REJECT" ? "Rejected" : "Cancelled"} swap for ${row.requestedBy.firstName} ${row.requestedBy.lastName} (${row.shift.date.toISOString().slice(0, 10)} ${row.shift.startTime}–${row.shift.endTime})`,
    entityType: "ShiftSwapRequest",
    entityId: id,
    metadata: { status, shiftId: row.shiftId, notes: notes ?? null },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, status });
}
