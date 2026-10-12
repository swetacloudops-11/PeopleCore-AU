import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const createSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  category: z.string().trim().min(1, "Category is required").max(60),
  description: z.string().trim().min(3, "Description is required").max(300),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  currency: z.string().trim().length(3, "Use a 3-letter currency code").optional(),
  expenseDate: dateStr,
  receiptName: z.string().max(200).nullish(),
  isReimbursable: z.boolean().optional(),
  status: z.enum(["DRAFT", "PENDING"]).optional(),
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

/** POST /api/org/expenses — lodge an expense claim. */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  const d = parsed.data;

  const employee = await prisma.employee.findFirst({
    where: { id: d.employeeId, organisationId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!employee) {
    return NextResponse.json(
      { error: "Employee not found", fields: { employeeId: "Unknown employee" } },
      { status: 404 }
    );
  }

  const status = d.status ?? "PENDING";
  const expense = await prisma.expense.create({
    data: {
      organisationId,
      employeeId: d.employeeId,
      category: d.category,
      description: d.description,
      amount: d.amount,
      currency: (d.currency ?? "AUD").toUpperCase(),
      expenseDate: dayOnly(d.expenseDate),
      receiptName: d.receiptName || null,
      isReimbursable: d.isReimbursable ?? true,
      status,
      submittedAt: status === "PENDING" ? new Date() : null,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "expense.created",
    category: "expenses",
    description: `${employee.firstName} ${employee.lastName} claimed ${d.amount.toFixed(2)} for ${d.category}`,
    entityType: "Expense",
    entityId: expense.id,
    metadata: { amount: d.amount, category: d.category, status },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ expense }, { status: 201 });
}
