import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { payrollApi, fieldErrors, clientIp } from "@/lib/payroll-api";
import { writeOrgAudit } from "@/lib/org-audit";

const decisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
});

/**
 * PATCH /api/payroll/timesheets/[id] — approve or reject a SUBMITTED timesheet.
 * Any other status is a 409 so a stale tab cannot re-decide a timesheet.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { organisationId } = auth.ctx;

  const timesheet = await prisma.timesheet.findFirst({
    where: { id, organisationId },
    select: {
      id: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
    },
  });
  if (!timesheet) return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });

  const parsed = decisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const { action, reason } = parsed.data;

  if (timesheet.status !== "SUBMITTED") {
    return NextResponse.json(
      {
        error: `Only SUBMITTED timesheets can be ${
          action === "approve" ? "approved" : "rejected"
        } — this one is ${timesheet.status}`,
      },
      { status: 409 }
    );
  }

  const now = new Date();
  const updated =
    action === "approve"
      ? await prisma.timesheet.update({
          where: { id },
          data: { status: "APPROVED", approvedById: auth.ctx.session.id, approvedAt: now },
        })
      : await prisma.timesheet.update({
          where: { id },
          data: {
            status: "REJECTED",
            rejectedReason: reason && reason.length > 0 ? reason : "Rejected by payroll",
          },
        });

  const who = `${timesheet.employee.firstName} ${timesheet.employee.lastName}`;
  await writeOrgAudit({
    organisationId,
    action: action === "approve" ? "payroll.timesheet.approved" : "payroll.timesheet.rejected",
    category: "payroll",
    severity: action === "reject" ? "WARNING" : "INFO",
    description:
      action === "approve"
        ? `Approved timesheet for ${who}`
        : `Rejected timesheet for ${who}${reason ? ` — ${reason}` : ""}`,
    entityType: "Timesheet",
    entityId: id,
    metadata: { fromStatus: "SUBMITTED", toStatus: updated.status, reason: reason ?? null },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
