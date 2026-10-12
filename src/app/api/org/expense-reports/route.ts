import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const createSchema = z
  .object({
    employeeId: z.string().min(1, "Employee is required"),
    name: z.string().trim().min(3, "Name is required").max(80),
    periodStart: dateStr,
    periodEnd: dateStr,
    totalAmount: z.coerce.number().min(0, "Total cannot be negative"),
    itemCount: z.coerce.number().int().min(0).max(999),
    status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "REIMBURSED"]).optional(),
    notes: z.string().max(1000).nullish(),
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

/** POST /api/org/expense-reports — create an expense report. */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  const d = parsed.data;

  const employee = await prisma.employee.findFirst({
    where: { id: d.employeeId, organisationId },
    select: { firstName: true, lastName: true },
  });
  if (!employee) {
    return NextResponse.json(
      { error: "Employee not found", fields: { employeeId: "Unknown employee" } },
      { status: 404 }
    );
  }

  const report = await prisma.expenseReport.create({
    data: {
      organisationId,
      employeeId: d.employeeId,
      name: d.name,
      periodStart: dayOnly(d.periodStart),
      periodEnd: dayOnly(d.periodEnd),
      totalAmount: d.totalAmount,
      itemCount: d.itemCount,
      status: d.status ?? "DRAFT",
      notes: d.notes || null,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "expense_report.created",
    category: "expenses",
    description: `Created expense report "${report.name}" for ${employee.firstName} ${employee.lastName}`,
    entityType: "ExpenseReport",
    entityId: report.id,
    metadata: { totalAmount: d.totalAmount, itemCount: d.itemCount },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ report }, { status: 201 });
}
