import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80).optional(),
  weekStart: z.string().regex(DAY, "Use YYYY-MM-DD"),
  notes: z.string().max(500).nullish(),
});

/** "YYYY-MM-DD" → the calendar date stored for that day (UTC midnight). */
const pd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Whole-day arithmetic that stays on the calendar regardless of timezone. */
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** POST /api/org/rosters — create a roster week (idempotent per weekStart). */
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
  const weekStart = pd(data.weekStart);

  // Exact match first, then any overlapping week — calendar-date round trips
  // can drift by a day, and a roster week must never be created twice.
  const existing =
    (await prisma.roster.findFirst({ where: { organisationId, weekStart } })) ??
    (await prisma.roster.findFirst({
      where: {
        organisationId,
        weekStart: { lte: addDays(weekStart, 6) },
        weekEnd: { gte: weekStart },
      },
    }));
  if (existing) {
    return NextResponse.json({ ok: true, id: existing.id, existing: true });
  }

  const roster = await prisma.roster.create({
    data: {
      organisationId,
      name: data.name?.trim() || `Week of ${weekStart.getUTCDate()} ${MONTHS[weekStart.getUTCMonth()]}`,
      weekStart,
      weekEnd: addDays(weekStart, 6),
      notes: data.notes ?? null,
      status: "DRAFT",
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "ROSTER_CREATED",
    category: "Rostering",
    description: `Created roster '${roster.name}' for week starting ${data.weekStart}`,
    entityType: "Roster",
    entityId: roster.id,
    metadata: { weekStart: data.weekStart },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, id: roster.id }, { status: 201 });
}
