import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const attendanceSchema = z.object({
  type: z.literal("attendance"),
  employeeId: z.string().min(1, "Employee is required"),
  date: z.string().regex(DAY, "Use YYYY-MM-DD"),
  clockIn: z.string().regex(TIME, "Use HH:MM").nullish(),
  clockOut: z.string().regex(TIME, "Use HH:MM").nullish(),
  breakMinutes: z.coerce.number().int().min(0).max(600).optional(),
  status: z
    .enum(["PRESENT", "ABSENT", "LATE", "ON_LEAVE", "HALF_DAY", "REMOTE", "MISSING"])
    .optional(),
  source: z.string().max(40).optional(),
  notes: z.string().max(500).nullish(),
});

const timesheetSchema = z.object({
  type: z.literal("timesheet"),
  employeeId: z.string().min(1, "Employee is required"),
  periodStart: z.string().regex(DAY, "Use YYYY-MM-DD"),
  periodEnd: z.string().regex(DAY, "Use YYYY-MM-DD"),
  totalHours: z.coerce.number().min(0).max(1000).optional(),
  overtimeHours: z.coerce.number().min(0).max(1000).optional(),
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"]).optional(),
  notes: z.string().max(500).nullish(),
});

const entrySchema = z.object({
  type: z.literal("entry"),
  timesheetId: z.string().min(1, "Timesheet is required"),
  date: z.string().regex(DAY, "Use YYYY-MM-DD"),
  startTime: z.string().regex(TIME, "Use HH:MM").optional(),
  endTime: z.string().regex(TIME, "Use HH:MM").optional(),
  breakMinutes: z.coerce.number().int().min(0).max(600).optional(),
  hours: z.coerce.number().min(0).max(24).optional(),
  overtimeHours: z.coerce.number().min(0).max(24).optional(),
  notes: z.string().max(500).nullish(),
});

const schema = z.discriminatedUnion("type", [attendanceSchema, timesheetSchema, entrySchema]);

/** "YYYY-MM-DD" → the calendar date stored for that day (UTC midnight). */
const pd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const at = (date: string, time?: string | null) => (time ? new Date(`${date}T${time}:00`) : null);

/** worked = clock span minus break, overtime = anything beyond 8h. */
function minutes(clockIn: Date | null, clockOut: Date | null, breakMinutes: number) {
  const raw = clockIn && clockOut ? Math.round((clockOut.getTime() - clockIn.getTime()) / 60000) : 0;
  const worked = Math.max(0, raw - breakMinutes);
  return { worked, overtime: Math.max(0, worked - 480) };
}

/** POST /api/org/time — create an attendance record, timesheet or timesheet entry. */
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
  const ip = clientIp(req);

  if (data.type === "attendance") {
    const employee = await prisma.employee.findFirst({
      where: { id: data.employeeId, organisationId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    const date = pd(data.date);
    const clockIn = at(data.date, data.clockIn);
    const clockOut = at(data.date, data.clockOut);
    const breakMinutes = data.breakMinutes ?? 0;
    const { worked, overtime } = minutes(clockIn, clockOut, breakMinutes);
    const status = data.status ?? (clockIn ? "PRESENT" : "MISSING");

    const row = await prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: employee.id, date } },
      create: {
        organisationId,
        employeeId: employee.id,
        date,
        clockIn,
        clockOut,
        breakMinutes,
        workedMinutes: worked,
        overtimeMinutes: overtime,
        status,
        source: data.source ?? "MANUAL",
        notes: data.notes ?? null,
      },
      update: {
        clockIn,
        clockOut,
        breakMinutes,
        workedMinutes: worked,
        overtimeMinutes: overtime,
        status,
        ...(data.source ? { source: data.source } : {}),
        notes: data.notes ?? null,
      },
    });

    await writeOrgAudit({
      organisationId,
      action: "ATTENDANCE_CREATED",
      category: "Time & Attendance",
      description: `Recorded attendance for ${employee.firstName} ${employee.lastName} on ${data.date} (${status})`,
      entityType: "AttendanceRecord",
      entityId: row.id,
      metadata: { employeeId: employee.id, date: data.date, status, worked },
      ipAddress: ip,
    });

    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  }

  if (data.type === "timesheet") {
    const employee = await prisma.employee.findFirst({
      where: { id: data.employeeId, organisationId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    const periodStart = pd(data.periodStart);
    const periodEnd = pd(data.periodEnd);
    if (periodEnd < periodStart) {
      return NextResponse.json(
        { error: "Invalid period", fields: { periodEnd: "Must be on or after the start" } },
        { status: 422 }
      );
    }

    const row = await prisma.timesheet.upsert({
      where: { employeeId_periodStart: { employeeId: employee.id, periodStart } },
      create: {
        organisationId,
        employeeId: employee.id,
        periodStart,
        periodEnd,
        totalHours: data.totalHours ?? 0,
        overtimeHours: data.overtimeHours ?? 0,
        status: data.status ?? "DRAFT",
        notes: data.notes ?? null,
      },
      update: {
        periodEnd,
        totalHours: data.totalHours ?? undefined,
        overtimeHours: data.overtimeHours ?? undefined,
        status: data.status ?? undefined,
        notes: data.notes ?? null,
      },
    });

    await writeOrgAudit({
      organisationId,
      action: "TIMESHEET_CREATED",
      category: "Time & Attendance",
      description: `Created timesheet for ${employee.firstName} ${employee.lastName} (${data.periodStart} → ${data.periodEnd})`,
      entityType: "Timesheet",
      entityId: row.id,
      metadata: { employeeId: employee.id, periodStart: data.periodStart },
      ipAddress: ip,
    });

    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  }

  // entry
  const timesheet = await prisma.timesheet.findUnique({ where: { id: data.timesheetId } });
  if (!timesheet || timesheet.organisationId !== organisationId) {
    return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  }

  const breakMinutes = data.breakMinutes ?? 0;
  let hours = data.hours;
  if (hours === undefined && data.startTime && data.endTime) {
    const [sh, sm] = data.startTime.split(":").map(Number);
    const [eh, em] = data.endTime.split(":").map(Number);
    hours = Math.max(0, Math.round((((eh * 60 + em - (sh * 60 + sm) - breakMinutes) / 60) * 100)) / 100);
  }

  const entry = await prisma.timesheetEntry.create({
    data: {
      timesheetId: timesheet.id,
      date: pd(data.date),
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      breakMinutes,
      hours: hours ?? 0,
      overtimeHours: data.overtimeHours ?? 0,
      notes: data.notes ?? null,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "TIMESHEET_ENTRY_CREATED",
    category: "Time & Attendance",
    description: `Added a timesheet entry for ${data.date} (${hours ?? 0}h)`,
    entityType: "TimesheetEntry",
    entityId: entry.id,
    metadata: { timesheetId: timesheet.id, hours: hours ?? 0 },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true, id: entry.id }, { status: 201 });
}
