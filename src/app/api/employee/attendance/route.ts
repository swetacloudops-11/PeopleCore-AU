import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  action: z.enum(["clock_in", "clock_out"]),
});

/** Server-local midnight — "today" for @db.Date comparisons (house D() pattern). */
const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err &&
    (err as { code?: string }).code === "P2002";
}

/**
 * POST /api/employee/attendance — clock in / out for the signed-in employee.
 * One record per person per day (@@unique [employeeId, date]).
 */
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

  const today = D(0);

  if (parsed.data.action === "clock_in") {
    const existing = await prisma.attendanceRecord.findFirst({
      where: { organisationId, employeeId, date: today },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "Already clocked in today" }, { status: 409 });
    }

    const clockIn = new Date();
    const record = await prisma.attendanceRecord
      .create({
        data: {
          organisationId,
          employeeId,
          date: today,
          clockIn,
          status: "PRESENT",
          source: "SELF",
        },
      })
      .catch((err: unknown) => {
        if (isUniqueViolation(err)) return null;
        throw err;
      });
    if (!record) {
      return NextResponse.json({ error: "Already clocked in today" }, { status: 409 });
    }

    await writeOrgAudit({
      organisationId,
      action: "self.attendance.clocked_in",
      category: "self-service",
      description: "Employee clocked in via the self-service portal",
      entityType: "AttendanceRecord",
      entityId: record.id,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json(
      { ok: true, id: record.id, clockIn: clockIn.toISOString() },
      { status: 201 }
    );
  }

  // action === "clock_out"
  const record = await prisma.attendanceRecord.findFirst({
    where: { organisationId, employeeId, date: today },
  });
  if (!record) {
    return NextResponse.json({ error: "No attendance record for today" }, { status: 404 });
  }
  if (record.clockOut) {
    return NextResponse.json({ error: "You have already clocked out today" }, { status: 409 });
  }

  const clockOut = new Date();
  const startedAt = record.clockIn ? record.clockIn.getTime() : clockOut.getTime();
  const workedMinutes = Math.max(
    0,
    Math.round((clockOut.getTime() - startedAt) / 60000) - record.breakMinutes
  );

  const updated = await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: { clockOut, workedMinutes },
  });

  await writeOrgAudit({
    organisationId,
    action: "self.attendance.clocked_out",
    category: "self-service",
    description: "Employee clocked out via the self-service portal",
    entityType: "AttendanceRecord",
    entityId: record.id,
    metadata: { workedMinutes: updated.workedMinutes },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, workedMinutes: updated.workedMinutes });
}
