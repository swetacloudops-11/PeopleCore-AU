import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const patchSchema = z
  .object({
    name: z.string().trim().min(3, "Name is required").max(80).optional(),
    periodStart: dateStr.optional(),
    periodEnd: dateStr.optional(),
    totalAmount: z.coerce.number().min(0, "Total cannot be negative").optional(),
    itemCount: z.coerce.number().int().min(0).max(999).optional(),
    status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "REIMBURSED"]).optional(),
    notes: z.string().max(1000).nullish(),
  })
  .refine(
    (d) =>
      d.periodStart === undefined ||
      d.periodEnd === undefined ||
      d.periodEnd >= d.periodStart,
    {
      message: "Period end must be on or after the period start",
      path: ["periodEnd"],
    }
  );

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

/** PATCH /api/org/expense-reports/[id] — edit an expense report. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const existing = await prisma.expenseReport.findUnique({ where: { id } });
  if (!existing || existing.organisationId !== organisationId) {
    return NextResponse.json({ error: "Expense report not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  const d = parsed.data;

  const report = await prisma.expenseReport.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.periodStart !== undefined ? { periodStart: dayOnly(d.periodStart) } : {}),
      ...(d.periodEnd !== undefined ? { periodEnd: dayOnly(d.periodEnd) } : {}),
      ...(d.totalAmount !== undefined ? { totalAmount: d.totalAmount } : {}),
      ...(d.itemCount !== undefined ? { itemCount: d.itemCount } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "expense_report.updated",
    category: "expenses",
    description: `Updated expense report "${report.name}" (status ${report.status})`,
    entityType: "ExpenseReport",
    entityId: id,
    metadata: { status: report.status, totalAmount: Number(report.totalAmount) },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ report });
}

/** DELETE /api/org/expense-reports/[id] — remove an expense report. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const existing = await prisma.expenseReport.findUnique({ where: { id } });
  if (!existing || existing.organisationId !== organisationId) {
    return NextResponse.json({ error: "Expense report not found" }, { status: 404 });
  }

  await prisma.expenseReport.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "expense_report.deleted",
    category: "expenses",
    severity: "WARNING",
    description: `Deleted expense report "${existing.name}"`,
    entityType: "ExpenseReport",
    entityId: id,
    metadata: { totalAmount: Number(existing.totalAmount) },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
