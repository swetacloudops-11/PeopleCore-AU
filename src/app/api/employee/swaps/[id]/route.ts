import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";
import { formatDate } from "@/lib/format";

const schema = z.object({
  status: z.literal("CANCELLED"),
});

/** PATCH /api/employee/swaps/[id] — cancel one of the caller's own pending swap requests. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;
  const { organisationId, employeeId } = auth.ctx;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const row = await prisma.shiftSwapRequest.findFirst({
    where: { id, organisationId },
    include: {
      shift: { select: { date: true, startTime: true, endTime: true } },
    },
  });
  // Must exist AND belong to the signed-in person — other people's rows 404.
  if (!row || row.requestedById !== employeeId) {
    return NextResponse.json({ error: "Swap request not found" }, { status: 404 });
  }
  if (row.status !== "PENDING") {
    return NextResponse.json(
      { error: "Only pending swap requests can be cancelled" },
      { status: 409 }
    );
  }

  await prisma.shiftSwapRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  await writeOrgAudit({
    organisationId,
    action: "self.swap.cancelled",
    category: "self-service",
    description: `Cancelled a swap request for ${formatDate(row.shift.date)} ${row.shift.startTime}–${row.shift.endTime}`,
    entityType: "ShiftSwapRequest",
    entityId: id,
    metadata: { shiftId: row.shiftId },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, status: "CANCELLED" });
}
