import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  leaveTypeId: z.string().min(1, "Leave type is required"),
  startDate: z.string().regex(DAY, "Use YYYY-MM-DD"),
  endDate: z.string().regex(DAY, "Use YYYY-MM-DD"),
  reason: z.string().max(500).nullish(),
  status: z.enum(["DRAFT", "PENDING"]).optional(),
});

/** "YYYY-MM-DD" → the calendar date stored for that day (UTC midnight). */
const pd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** POST /api/org/leave — lodge a leave request on behalf of an employee. */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const data = parsed.data;

  const startDate = pd(data.startDate);
  const endDate = pd(data.endDate);
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "Invalid dates", fields: { endDate: "Must be on or after the start date" } },
      { status: 422 }
    );
  }

  const [employee, leaveType] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: data.employeeId, organisationId },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.leaveType.findFirst({
      where: { id: data.leaveTypeId, organisationId },
      select: { id: true, name: true, unit: true },
    }),
  ]);
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (!leaveType) return NextResponse.json({ error: "Leave type not found" }, { status: 404 });

  // Days for display, hours for payroll (7.6h standard day).
  const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  const hours = days * 7.6;

  const row = await prisma.leaveRequest.create({
    data: {
      organisationId,
      employeeId: employee.id,
      leaveTypeId: leaveType.id,
      startDate,
      endDate,
      days,
      hours,
      reason: data.reason ?? null,
      status: data.status ?? "PENDING",
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "LEAVE_REQUESTED",
    category: "Leave",
    description: `Lodged ${leaveType.name} for ${employee.firstName} ${employee.lastName} (${data.startDate} → ${data.endDate}, ${days}d)`,
    entityType: "LeaveRequest",
    entityId: row.id,
    metadata: { employeeId: employee.id, leaveTypeId: leaveType.id, days },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}
