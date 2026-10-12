import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  rosterId: z.string().optional(),
  weekStart: z.string().regex(DAY, "Use YYYY-MM-DD").optional(),
  rosterName: z.string().max(80).optional(),
  employeeId: z.string().min(1, "Employee is required"),
  date: z.string().regex(DAY, "Use YYYY-MM-DD").optional(),
  dates: z.array(z.string().regex(DAY)).min(1).max(14).optional(),
  startTime: z.string().regex(TIME, "Use HH:MM"),
  endTime: z.string().regex(TIME, "Use HH:MM"),
  breakMinutes: z.coerce.number().int().min(0).max(240).optional(),
  locationId: z.string().nullish(),
  roleLabel: z.string().max(60).nullish(),
  notes: z.string().max(500).nullish(),
  isOvertime: z.boolean().optional(),
});

/** "YYYY-MM-DD" → the calendar date stored for that day (UTC midnight). */
const pd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Whole-day arithmetic that stays on the calendar regardless of timezone. */
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** Paid hours for a shift, tolerating overnight spans. */
function hoursBetween(start: string, end: string, breakMinutes: number) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return Math.max(0, Math.round(((mins - breakMinutes) / 60) * 100) / 100);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** POST /api/org/shifts — create one shift, or several for one employee across dates. */
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

  const dates = data.dates?.length ? data.dates : data.date ? [data.date] : [];
  if (dates.length === 0) {
    return NextResponse.json(
      { error: "Choose at least one date", fields: { date: "Required" } },
      { status: 422 }
    );
  }

  const [employee, location] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: data.employeeId, organisationId },
      select: { id: true, firstName: true, lastName: true },
    }),
    data.locationId
      ? prisma.location.findFirst({ where: { id: data.locationId, organisationId } })
      : Promise.resolve(null),
  ]);
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (data.locationId && !location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  // Resolve (or lazily create) the target roster.
  let roster;
  if (data.rosterId) {
    roster = await prisma.roster.findUnique({ where: { id: data.rosterId } });
    if (!roster || roster.organisationId !== organisationId) {
      return NextResponse.json({ error: "Roster not found" }, { status: 404 });
    }
  } else if (data.weekStart) {
    const weekStart = pd(data.weekStart);
    roster =
      (await prisma.roster.findFirst({ where: { organisationId, weekStart } })) ??
      (await prisma.roster.findFirst({
        where: {
          organisationId,
          weekStart: { lte: addDays(weekStart, 6) },
          weekEnd: { gte: weekStart },
        },
      }));
    if (!roster) {
      roster = await prisma.roster.create({
        data: {
          organisationId,
          name:
            data.rosterName?.trim() ||
            `Week of ${weekStart.getUTCDate()} ${MONTHS[weekStart.getUTCMonth()]}`,
          weekStart,
          weekEnd: addDays(weekStart, 6),
          status: "DRAFT",
        },
      });
    }
  } else {
    return NextResponse.json(
      { error: "Choose a roster or a week", fields: { weekStart: "Required" } },
      { status: 422 }
    );
  }

  const breakMinutes = data.breakMinutes ?? 30;
  const hours = hoursBetween(data.startTime, data.endTime, breakMinutes);

  const created = await prisma.shift.createMany({
    data: dates.map((d) => ({
      organisationId,
      rosterId: roster!.id,
      employeeId: employee.id,
      locationId: data.locationId ?? null,
      date: pd(d),
      startTime: data.startTime,
      endTime: data.endTime,
      breakMinutes,
      hours,
      roleLabel: data.roleLabel ?? null,
      isOvertime: data.isOvertime ?? false,
      notes: data.notes ?? null,
      status: "SCHEDULED" as const,
    })),
  });

  await writeOrgAudit({
    organisationId,
    action: "SHIFT_CREATED",
    category: "Rostering",
    description: `Created ${created.count} shift${created.count === 1 ? "" : "s"} for ${employee.firstName} ${employee.lastName} (${data.startTime}–${data.endTime})`,
    entityType: "Shift",
    entityId: roster.id,
    metadata: {
      rosterId: roster.id,
      employeeId: employee.id,
      dates,
      hours,
      count: created.count,
    },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, count: created.count, rosterId: roster.id }, { status: 201 });
}
