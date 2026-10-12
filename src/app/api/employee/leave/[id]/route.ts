import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  status: z.literal("CANCELLED"),
});

/**
 * PATCH /api/employee/leave/[id] — cancel the signed-in person's own PENDING
 * leave request. Ownership is verified against ctx.employeeId; the employeeId
 * is never accepted from the client.
 */
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

  const row = await prisma.leaveRequest.findFirst({
    where: { id, organisationId },
    include: { leaveType: { select: { name: true } } },
  });
  if (!row || row.employeeId !== employeeId) {
    return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
  }
  if (row.status !== "PENDING") {
    return NextResponse.json(
      { error: "Only pending requests can be cancelled" },
      { status: 409 }
    );
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  await writeOrgAudit({
    organisationId,
    action: "self.leave.cancelled",
    category: "self-service",
    description: `Cancelled own ${row.leaveType.name} request (${row.startDate
      .toISOString()
      .slice(0, 10)} → ${row.endDate.toISOString().slice(0, 10)})`,
    entityType: "LeaveRequest",
    entityId: id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
