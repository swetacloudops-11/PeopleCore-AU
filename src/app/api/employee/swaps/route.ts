import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";
import { formatDate } from "@/lib/format";

const schema = z.object({
  shiftId: z.string().min(1),
  reason: z.string().max(300).nullish(),
  offeredToId: z.string().min(1).nullish(),
});

/** POST /api/employee/swaps — request a swap on one of the caller's own shifts. */
export async function POST(req: NextRequest) {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;
  const { organisationId, employeeId } = auth.ctx;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const { shiftId, reason, offeredToId } = parsed.data;

  // 1. The shift must belong to the signed-in employee.
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, employeeId, organisationId },
  });
  if (!shift) {
    return NextResponse.json(
      { error: "Shift not found", fields: { shiftId: "Shift not found" } },
      { status: 404 }
    );
  }

  // 2. Only one pending swap request per shift.
  const existing = await prisma.shiftSwapRequest.findFirst({
    where: { shiftId, status: "PENDING" },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This shift already has a pending swap request" },
      { status: 409 }
    );
  }

  // 3. The offered teammate must exist in the same organisation (and not be you).
  let offeredTo: string | null = null;
  if (offeredToId) {
    if (offeredToId === employeeId) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          fields: { offeredToId: "Choose a teammate other than yourself" },
        },
        { status: 422 }
      );
    }
    const mate = await prisma.employee.findFirst({
      where: { id: offeredToId, organisationId },
      select: { id: true },
    });
    if (!mate) {
      return NextResponse.json(
        { error: "Invalid payload", fields: { offeredToId: "Unknown teammate" } },
        { status: 404 }
      );
    }
    offeredTo = offeredToId;
  }

  // 4. Create the request.
  const request = await prisma.shiftSwapRequest.create({
    data: {
      organisationId,
      shiftId,
      requestedById: employeeId,
      offeredToId: offeredTo,
      reason: reason?.trim() || null,
      status: "PENDING",
    },
  });

  // 5. Audit.
  await writeOrgAudit({
    organisationId,
    action: "self.swap.requested",
    category: "self-service",
    description: `Requested a swap for ${formatDate(shift.date)} ${shift.startTime}–${shift.endTime}`,
    entityType: "ShiftSwapRequest",
    entityId: request.id,
    metadata: { shiftId, offeredToId: offeredTo },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json(
    { ok: true, item: { id: request.id, status: request.status } },
    { status: 201 }
  );
}
