import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNotes: z.string().max(1000).nullish(),
});

/** PATCH /api/hr/leave/[id] — approve or reject a pending leave request. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const { status, reviewNotes } = parsed.data;

  const row = await prisma.leaveRequest.findFirst({
    where: { id, organisationId },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      leaveType: { select: { name: true } },
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
  }
  if (row.status !== "PENDING" && row.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Only pending requests can be reviewed" },
      { status: 409 }
    );
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status,
      reviewNotes: reviewNotes ?? null,
      reviewedById: auth.ctx.session.id,
      reviewedAt: new Date(),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: status === "APPROVED" ? "HR_LEAVE_APPROVED" : "HR_LEAVE_REJECTED",
    category: "leave",
    severity: status === "REJECTED" ? "WARNING" : "INFO",
    description: `${
      status === "APPROVED" ? "Approved" : "Rejected"
    } ${row.leaveType.name} for ${row.employee.firstName} ${row.employee.lastName}`,
    entityType: "LeaveRequest",
    entityId: id,
    metadata: { status, reviewNotes: reviewNotes ?? null },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
