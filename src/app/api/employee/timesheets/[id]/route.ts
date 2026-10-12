import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  action: z.enum(["submit", "delete"]),
});

/**
 * PATCH /api/employee/timesheets/[id] — the signed-in employee may submit or
 * delete their OWN draft timesheet. Nothing else is permitted.
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
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const row = await prisma.timesheet.findFirst({
    where: { id, organisationId },
    include: { entries: { select: { id: true } } },
  });
  if (!row || row.employeeId !== employeeId) {
    return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  }

  const periodLabel = `${row.periodStart.toISOString().slice(0, 10)} to ${row.periodEnd
    .toISOString()
    .slice(0, 10)}`;
  const audit = {
    organisationId,
    category: "self-service",
    entityType: "Timesheet",
    entityId: row.id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  };

  if (parsed.data.action === "submit") {
    if (row.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Only draft timesheets can be submitted" },
        { status: 409 }
      );
    }

    await prisma.timesheet.update({
      where: { id: row.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    await writeOrgAudit({
      ...audit,
      action: "self.timesheet.submitted",
      description: `Timesheet ${periodLabel} submitted for approval via the self-service portal`,
      metadata: { totalHours: Number(row.totalHours), entryCount: row.entries.length },
    });

    return NextResponse.json({ ok: true, status: "SUBMITTED" });
  }

  // action === "delete"
  if (row.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Only draft timesheets can be deleted" },
      { status: 409 }
    );
  }

  await prisma.timesheet.delete({ where: { id: row.id } });

  await writeOrgAudit({
    ...audit,
    action: "self.timesheet.deleted",
    description: `Draft timesheet ${periodLabel} deleted via the self-service portal`,
    metadata: { totalHours: Number(row.totalHours), entryCount: row.entries.length },
  });

  return NextResponse.json({ ok: true });
}
