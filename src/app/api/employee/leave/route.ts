import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const schema = z.object({
  leaveTypeId: z.string().min(1),
  startDate: dateStr,
  endDate: dateStr,
  days: z.number().min(0.5).max(365),
  hours: z.number().min(0).max(244).optional(),
  reason: z.string().min(5).max(500),
});

/** Build a local-midnight Date from a yyyy-mm-dd string (matches @db.Date seeds). */
function localDate(value: string): Date | null {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** POST /api/employee/leave — apply for leave (always created as PENDING). */
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
  const data = parsed.data;

  // 1. The leave type must belong to this org and still be active.
  const leaveType = await prisma.leaveType.findUnique({
    where: { id: data.leaveTypeId },
    select: { id: true, name: true, organisationId: true, isActive: true },
  });
  if (!leaveType || leaveType.organisationId !== organisationId || !leaveType.isActive) {
    return NextResponse.json(
      { error: "Leave type not found", fields: { leaveTypeId: "Choose a valid leave type" } },
      { status: 404 }
    );
  }

  // 2. Date sanity — end must not fall before start.
  const start = localDate(data.startDate);
  const end = localDate(data.endDate);
  if (!start || !end) {
    return NextResponse.json(
      { error: "Invalid dates", fields: { startDate: "Use a valid date" } },
      { status: 422 }
    );
  }
  if (end < start) {
    return NextResponse.json(
      {
        error: "End date must be on or after the start date",
        fields: { endDate: "End date must be on or after the start date" },
      },
      { status: 422 }
    );
  }

  // 3. Create the request — the employee is always the signed-in person.
  const row = await prisma.leaveRequest.create({
    data: {
      organisationId,
      employeeId,
      leaveTypeId: leaveType.id,
      startDate: start,
      endDate: end,
      days: data.days,
      hours: data.hours ?? 0,
      reason: data.reason.trim(),
      status: "PENDING",
      appliedAt: new Date(),
    },
  });

  // 4. Audit
  await writeOrgAudit({
    organisationId,
    action: "self.leave.applied",
    category: "self-service",
    description: `Applied for ${leaveType.name} · ${data.days}d (${data.startDate} → ${data.endDate})`,
    entityType: "LeaveRequest",
    entityId: row.id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, item: { id: row.id, status: row.status } }, { status: 201 });
}
