import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

const daySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeStr.nullish(),
  endTime: timeStr.nullish(),
  isAvailable: z.boolean(),
  note: z.string().max(200).nullish(),
});

const schema = z.object({
  days: z.array(daySchema).length(7),
});

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** PUT /api/employee/availability — replace the caller's weekly availability. */
export async function PUT(req: NextRequest) {
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
  const days = parsed.data.days;

  // Sanity: when both times are given the shift must end after it starts.
  for (const d of days) {
    if (d.startTime && d.endTime && d.endTime <= d.startTime) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          fields: {
            days: `${DAY_NAMES[d.dayOfWeek]}: end time must be after start time`,
          },
        },
        { status: 422 }
      );
    }
  }

  try {
    await prisma.$transaction(
      days.map((d) =>
        prisma.availability.upsert({
          where: {
            employeeId_dayOfWeek: { employeeId, dayOfWeek: d.dayOfWeek },
          },
          update: {
            startTime: d.startTime ?? null,
            endTime: d.endTime ?? null,
            isAvailable: d.isAvailable,
            note: d.note?.trim() || null,
          },
          create: {
            organisationId,
            employeeId,
            dayOfWeek: d.dayOfWeek,
            startTime: d.startTime ?? null,
            endTime: d.endTime ?? null,
            isAvailable: d.isAvailable,
            note: d.note?.trim() || null,
          },
        })
      )
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "Availability was just updated — please try again" },
        { status: 409 }
      );
    }
    throw err;
  }

  await writeOrgAudit({
    organisationId,
    action: "self.availability.updated",
    category: "self-service",
    description: `Updated weekly availability (${
      days.filter((d) => d.isAvailable).length
    } of 7 days available)`,
    entityType: "Availability",
    entityId: employeeId,
    metadata: {
      availableDays: days
        .filter((d) => d.isAvailable)
        .map((d) => d.dayOfWeek),
    },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
