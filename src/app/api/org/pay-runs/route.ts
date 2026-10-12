import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const createSchema = z
  .object({
    label: z.string().trim().min(3, "Label is required").max(80),
    periodStart: dateStr,
    periodEnd: dateStr,
    payDate: dateStr,
    payScheduleId: z.string().min(1).optional(),
    notes: z.string().max(500).nullish(),
  })
  .refine((d) => d.periodEnd >= d.periodStart, {
    message: "Period end must be on or after the period start",
    path: ["periodEnd"],
  });

/** Date-only inputs are calendar days — build them in UTC so the value
 *  round-trips through Prisma's @db.Date column regardless of server TZ. */
function dayOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function invalid(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return NextResponse.json(
    { error: "Please correct the highlighted fields", fields: fieldErrors(issues) },
    { status: 422 }
  );
}

/** POST /api/org/pay-runs — create a draft pay run. */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  const d = parsed.data;

  // Cross-tenant check on the linked schedule before it is written.
  if (d.payScheduleId) {
    const schedule = await prisma.paySchedule.findFirst({
      where: { id: d.payScheduleId, organisationId },
      select: { id: true },
    });
    if (!schedule) {
      return NextResponse.json(
        {
          error: "Pay schedule not found",
          fields: { payScheduleId: "Unknown pay schedule" },
        },
        { status: 404 }
      );
    }
  }

  const payRun = await prisma.payRun.create({
    data: {
      organisationId,
      label: d.label,
      periodStart: dayOnly(d.periodStart),
      periodEnd: dayOnly(d.periodEnd),
      payDate: dayOnly(d.payDate),
      payScheduleId: d.payScheduleId ?? null,
      notes: d.notes || null,
      status: "DRAFT",
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "pay_run.created",
    category: "payroll",
    description: `Created draft pay run "${payRun.label}"`,
    entityType: "PayRun",
    entityId: payRun.id,
    metadata: {
      periodStart: payRun.periodStart,
      periodEnd: payRun.periodEnd,
      payDate: payRun.payDate,
    },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ payRun }, { status: 201 });
}
