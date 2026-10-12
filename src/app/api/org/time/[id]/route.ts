import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const schema = z.object({
  type: z.enum(["attendance", "timesheet"]),
  // attendance fields
  clockIn: z.string().regex(TIME, "Use HH:MM").nullish(),
  clockOut: z.string().regex(TIME, "Use HH:MM").nullish(),
  breakMinutes: z.coerce.number().int().min(0).max(600).optional(),
  status: z
    .enum(["PRESENT", "ABSENT", "LATE", "ON_LEAVE", "HALF_DAY", "REMOTE", "MISSING"])
    .optional(),
  source: z.string().max(40).optional(),
  notes: z.string().max(500).nullish(),
  // timesheet fields
  action: z.enum(["SUBMIT", "APPROVE", "REJECT", "PAY", "REOPEN"]).optional(),
  reason: z.string().max(500).nullish(),
  totalHours: z.coerce.number().min(0).max(1000).optional(),
  overtimeHours: z.coerce.number().min(0).max(1000).optional(),
});

const at = (date: Date, time?: string | null) => {
  if (!time) return null;
  // `date` is a calendar date at UTC midnight — read its parts in UTC.
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return new Date(`${y}-${m}-${d}T${time}:00`);
};

/** PATCH /api/org/time/[id] — update an attendance record or drive a timesheet lifecycle. */
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
  const data = parsed.data;
  const ip = clientIp(req);

  if (data.type === "attendance") {
    const row = await prisma.attendanceRecord.findUnique({ where: { id } });
    if (!row || row.organisationId !== organisationId) {
      return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });
    }

    const clockIn = data.clockIn !== undefined ? at(row.date, data.clockIn) : row.clockIn;
    const clockOut = data.clockOut !== undefined ? at(row.date, data.clockOut) : row.clockOut;
    const breakMinutes = data.breakMinutes ?? row.breakMinutes;
    const raw =
      clockIn && clockOut ? Math.round((clockOut.getTime() - clockIn.getTime()) / 60000) : 0;
    const worked = Math.max(0, raw - breakMinutes);

    const updated = await prisma.attendanceRecord.update({
      where: { id },
      data: {
        clockIn,
        clockOut,
        breakMinutes,
        workedMinutes: worked,
        overtimeMinutes: Math.max(0, worked - 480),
        status: data.status ?? row.status,
        ...(data.source ? { source: data.source } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });

    await writeOrgAudit({
      organisationId,
      action: "ATTENDANCE_UPDATED",
      category: "Time & Attendance",
      description: `Updated attendance record for ${row.date.toISOString().slice(0, 10)} (${updated.status})`,
      entityType: "AttendanceRecord",
      entityId: id,
      metadata: { status: updated.status, workedMinutes: updated.workedMinutes },
      ipAddress: ip,
    });

    return NextResponse.json({ ok: true, record: updated });
  }

  // ── timesheet ──
  const row = await prisma.timesheet.findUnique({ where: { id } });
  if (!row || row.organisationId !== organisationId) {
    return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  }
  if (row.status === "PAID" && data.action && data.action !== "PAY") {
    return NextResponse.json({ error: "A paid timesheet can no longer be changed" }, { status: 409 });
  }

  const now = new Date();
  const patch: Record<string, unknown> = {};

  if (data.action === "SUBMIT") {
    patch.status = "SUBMITTED";
    patch.submittedAt = now;
    patch.rejectedReason = null;
  } else if (data.action === "APPROVE") {
    patch.status = "APPROVED";
    patch.approvedById = auth.ctx.session.id;
    patch.approvedAt = now;
    patch.rejectedReason = null;
  } else if (data.action === "REJECT") {
    patch.status = "REJECTED";
    patch.rejectedReason = data.reason?.trim() || "Rejected by administrator";
    patch.approvedById = null;
    patch.approvedAt = null;
  } else if (data.action === "PAY") {
    patch.status = "PAID";
  } else if (data.action === "REOPEN") {
    patch.status = "DRAFT";
    patch.submittedAt = null;
    patch.approvedById = null;
    patch.approvedAt = null;
    patch.rejectedReason = null;
  }

  if (row.status !== "PAID") {
    if (data.totalHours !== undefined) patch.totalHours = data.totalHours;
    if (data.overtimeHours !== undefined) patch.overtimeHours = data.overtimeHours;
    if (data.notes !== undefined) patch.notes = data.notes;
  }

  const updated = await prisma.timesheet.update({ where: { id }, data: patch });

  await writeOrgAudit({
    organisationId,
    action: data.action ? `TIMESHEET_${data.action}` : "TIMESHEET_UPDATED",
    category: "Time & Attendance",
    severity: data.action === "REJECT" ? "WARNING" : "INFO",
    description: data.action
      ? `Timesheet ${data.action.toLowerCase()} for ${row.periodStart.toISOString().slice(0, 10)} period (${updated.totalHours.toString()}h)`
      : `Updated timesheet for ${row.periodStart.toISOString().slice(0, 10)} period`,
    entityType: "Timesheet",
    entityId: id,
    metadata: { status: updated.status, reason: data.reason ?? null },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true, timesheet: updated });
}
