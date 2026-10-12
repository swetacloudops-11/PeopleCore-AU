import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const patchSchema = z.object({
  employeeId: z.string().optional(),
  date: z.string().regex(DAY, "Use YYYY-MM-DD").optional(),
  startTime: z.string().regex(TIME, "Use HH:MM").optional(),
  endTime: z.string().regex(TIME, "Use HH:MM").optional(),
  breakMinutes: z.coerce.number().int().min(0).max(240).optional(),
  locationId: z.string().nullish(),
  roleLabel: z.string().max(60).nullish(),
  notes: z.string().max(500).nullish(),
  isOvertime: z.boolean().optional(),
  status: z
    .enum(["SCHEDULED", "CONFIRMED", "SWAP_REQUESTED", "SWAPPED", "CANCELLED", "COMPLETED", "MISSED"])
    .optional(),
});

const pd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function hoursBetween(start: string, end: string, breakMinutes: number) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return Math.max(0, Math.round(((mins - breakMinutes) / 60) * 100) / 100);
}

/** PATCH /api/org/shifts/[id] — edit a shift's time, place or status. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const data = parsed.data;

  const row = await prisma.shift.findUnique({ where: { id } });
  if (!row || row.organisationId !== organisationId) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }

  if (data.employeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: data.employeeId, organisationId },
      select: { id: true },
    });
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (data.locationId) {
    const location = await prisma.location.findFirst({
      where: { id: data.locationId, organisationId },
      select: { id: true },
    });
    if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const startTime = data.startTime ?? row.startTime;
  const endTime = data.endTime ?? row.endTime;
  const breakMinutes = data.breakMinutes ?? row.breakMinutes;
  const timeChanged =
    data.startTime !== undefined || data.endTime !== undefined || data.breakMinutes !== undefined;

  const updated = await prisma.shift.update({
    where: { id },
    data: {
      ...(data.employeeId ? { employeeId: data.employeeId } : {}),
      ...(data.date ? { date: pd(data.date) } : {}),
      ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
      ...(data.endTime !== undefined ? { endTime: data.endTime } : {}),
      ...(data.breakMinutes !== undefined ? { breakMinutes } : {}),
      ...(data.locationId !== undefined ? { locationId: data.locationId } : {}),
      ...(data.roleLabel !== undefined ? { roleLabel: data.roleLabel } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.isOvertime !== undefined ? { isOvertime: data.isOvertime } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(timeChanged ? { hours: hoursBetween(startTime, endTime, breakMinutes) } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "SHIFT_UPDATED",
    category: "Rostering",
    description: `Updated shift on ${updated.date.toISOString().slice(0, 10)} (${updated.startTime}–${updated.endTime})`,
    entityType: "Shift",
    entityId: id,
    metadata: data,
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, shift: updated });
}

/** DELETE /api/org/shifts/[id] — remove a shift from the roster. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;
  const { id } = await params;

  const row = await prisma.shift.findUnique({ where: { id } });
  if (!row || row.organisationId !== organisationId) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }

  await prisma.shift.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "SHIFT_DELETED",
    category: "Rostering",
    severity: "WARNING",
    description: `Deleted shift on ${row.date.toISOString().slice(0, 10)} (${row.startTime}–${row.endTime})`,
    entityType: "Shift",
    entityId: id,
    metadata: { rosterId: row.rosterId, employeeId: row.employeeId },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true });
}
