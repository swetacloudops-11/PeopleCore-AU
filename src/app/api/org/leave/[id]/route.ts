import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  action: z.enum(["APPROVE", "REJECT", "CANCEL"]),
  notes: z.string().max(500).nullish(),
});

/** PATCH /api/org/leave/[id] — approve, reject or cancel a leave request. */
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

  const row = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      leaveType: { select: { name: true } },
    },
  });
  if (!row || row.organisationId !== organisationId) {
    return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
  }

  if ((action === "APPROVE" || action === "REJECT") && row.status !== "PENDING" && row.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Only pending requests can be ${action === "APPROVE" ? "approved" : "rejected"}` },
      { status: 409 }
    );
  }
  if (action === "CANCEL" && (row.status === "CANCELLED" || row.status === "REJECTED")) {
    return NextResponse.json({ error: "This request is already closed" }, { status: 409 });
  }

  const status = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CANCELLED";
  const now = new Date();

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status,
      reviewedById: action === "CANCEL" ? row.reviewedById : auth.ctx.session.id,
      reviewedAt: now,
      reviewNotes: notes ?? row.reviewNotes,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: `LEAVE_${action}`,
    category: "Leave",
    severity: action === "REJECT" ? "WARNING" : "INFO",
    description: `${action === "APPROVE" ? "Approved" : action === "REJECT" ? "Rejected" : "Cancelled"} ${row.leaveType.name} for ${row.employee.firstName} ${row.employee.lastName}`,
    entityType: "LeaveRequest",
    entityId: id,
    metadata: { status, notes: notes ?? null },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
