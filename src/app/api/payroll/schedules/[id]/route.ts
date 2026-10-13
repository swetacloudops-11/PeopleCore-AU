import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { payrollApi, fieldErrors, clientIp } from "@/lib/payroll-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const patchSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(80).optional(),
  frequency: z.enum(["WEEKLY", "FORTNIGHTLY", "MONTHLY"]).optional(),
  payDay: z.coerce.number().int().min(0, "0 = Sunday").max(6, "6 = Saturday").optional(),
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

function invalid(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return NextResponse.json(
    { error: "Invalid payload", fields: fieldErrors(issues) },
    { status: 422 }
  );
}

/** PATCH /api/payroll/schedules/[id] — edit a pay schedule. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { organisationId } = auth.ctx;

  const { id } = await params;
  const existing = await prisma.paySchedule.findFirst({ where: { id, organisationId } });
  if (!existing) {
    return NextResponse.json({ error: "Pay schedule not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  const d = parsed.data;

  try {
    const schedule = await prisma.paySchedule.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.frequency !== undefined ? { frequency: d.frequency } : {}),
        ...(d.payDay !== undefined ? { payDay: d.payDay } : {}),
        ...(d.nextRunDate !== undefined
          ? { nextRunDate: d.nextRunDate ? dayOnly(d.nextRunDate) : null }
          : {}),
        ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
      },
    });

    await writeOrgAudit({
      organisationId,
      action: "payroll.schedule.updated",
      category: "payroll",
      description: `Updated pay schedule "${schedule.name}"`,
      entityType: "PaySchedule",
      entityId: id,
      metadata: { frequency: schedule.frequency, isActive: schedule.isActive },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true, item: schedule });
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

/** DELETE /api/payroll/schedules/[id] — only when no pay runs reference it. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { organisationId } = auth.ctx;

  const { id } = await params;
  const existing = await prisma.paySchedule.findFirst({ where: { id, organisationId } });
  if (!existing) {
    return NextResponse.json({ error: "Pay schedule not found" }, { status: 404 });
  }

  const payRunCount = await prisma.payRun.count({ where: { organisationId, payScheduleId: id } });
  if (payRunCount > 0) {
    return NextResponse.json(
      {
        error: `This schedule is linked to ${payRunCount} pay run${payRunCount === 1 ? "" : "s"} — deactivate it instead`,
      },
      { status: 409 }
    );
  }

  await prisma.paySchedule.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "payroll.schedule.deleted",
    category: "payroll",
    severity: "WARNING",
    description: `Deleted pay schedule "${existing.name}"`,
    entityType: "PaySchedule",
    entityId: id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
