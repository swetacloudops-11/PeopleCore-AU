import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const createSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  frequency: z.enum(["WEEKLY", "FORTNIGHTLY", "MONTHLY"]),
  payDay: z.coerce.number().int().min(0, "0 = Sunday").max(6, "6 = Saturday"),
  nextRunDate: dateStr.nullish(),
  isActive: z.boolean().optional(),
});

/** Date-only inputs are calendar days — build them in UTC so the value
 *  round-trips through Prisma's @db.Date column regardless of server TZ. */
function dayOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** POST /api/org/pay-schedules — create a pay schedule. */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;

  try {
    const schedule = await prisma.paySchedule.create({
      data: {
        organisationId,
        name: d.name,
        frequency: d.frequency,
        payDay: d.payDay,
        nextRunDate: d.nextRunDate ? dayOnly(d.nextRunDate) : null,
        isActive: d.isActive ?? true,
      },
    });

    await writeOrgAudit({
      organisationId,
      action: "pay_schedule.created",
      category: "payroll",
      description: `Created pay schedule "${schedule.name}"`,
      entityType: "PaySchedule",
      entityId: schedule.id,
      metadata: { frequency: schedule.frequency, payDay: schedule.payDay },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        {
          error: "A pay schedule with this name already exists",
          fields: { name: "Already in use" },
        },
        { status: 422 }
      );
    }
    throw err;
  }
}
