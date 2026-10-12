import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const schema = z.object({
  employeeId: z.string().min(1).optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  startTime: z.string().regex(TIME, "Use HH:MM").nullish(),
  endTime: z.string().regex(TIME, "Use HH:MM").nullish(),
  isAvailable: z.boolean().optional(),
  note: z.string().max(200).nullish(),
});

/**
 * PATCH /api/org/availability/[id]
 * Updates one availability row. When `[id]` is the literal `new`, the body must
 * carry `employeeId` + `dayOfWeek` and the row is created (upserted) instead —
 * there is no separate POST route for availability.
 */
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
  // Start/end only apply while the employee is marked available.
  const isAvailable = data.isAvailable ?? true;
  const start = isAvailable ? (data.startTime ?? null) : null;
  const end = isAvailable ? (data.endTime ?? null) : null;

  if (id === "new") {
    if (!data.employeeId || data.dayOfWeek === undefined) {
      return NextResponse.json(
        { error: "employeeId and dayOfWeek are required", fields: { employeeId: "Required" } },
        { status: 422 }
      );
    }
    const employee = await prisma.employee.findFirst({
      where: { id: data.employeeId, organisationId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    const row = await prisma.availability.upsert({
      where: { employeeId_dayOfWeek: { employeeId: employee.id, dayOfWeek: data.dayOfWeek } },
      create: {
        organisationId,
        employeeId: employee.id,
        dayOfWeek: data.dayOfWeek,
        startTime: start,
        endTime: end,
        isAvailable,
        note: data.note ?? null,
      },
      update: { startTime: start, endTime: end, isAvailable, note: data.note ?? undefined },
    });

    await writeOrgAudit({
      organisationId,
      action: "AVAILABILITY_UPDATED",
      category: "Time & Attendance",
      description: `Set availability for ${employee.firstName} ${employee.lastName} (day ${data.dayOfWeek})`,
      entityType: "Availability",
      entityId: row.id,
      metadata: { employeeId: employee.id, dayOfWeek: data.dayOfWeek, isAvailable },
      ipAddress: clientIp(req),
    });

    return NextResponse.json({ ok: true, id: row.id });
  }

  const row = await prisma.availability.findUnique({ where: { id } });
  if (!row || row.organisationId !== organisationId) {
    return NextResponse.json({ error: "Availability not found" }, { status: 404 });
  }

  const available = data.isAvailable ?? row.isAvailable;
  const nextStart = available ? (data.startTime ?? row.startTime) : null;
  const nextEnd = available ? (data.endTime ?? row.endTime) : null;

  const updated = await prisma.availability.update({
    where: { id },
    data: {
      ...(data.employeeId !== undefined ? { employeeId: data.employeeId } : {}),
      ...(data.dayOfWeek !== undefined ? { dayOfWeek: data.dayOfWeek } : {}),
      ...(data.isAvailable !== undefined || data.startTime !== undefined || data.endTime !== undefined
        ? { isAvailable: available, startTime: nextStart, endTime: nextEnd }
        : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "AVAILABILITY_UPDATED",
    category: "Time & Attendance",
    description: `Updated availability (day ${updated.dayOfWeek}) — ${updated.isAvailable ? `${updated.startTime ?? "—"}–${updated.endTime ?? "—"}` : "unavailable"}`,
    entityType: "Availability",
    entityId: id,
    metadata: { dayOfWeek: updated.dayOfWeek, isAvailable: updated.isAvailable },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, id: updated.id });
}
