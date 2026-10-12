import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const schema = z.object({
  category: z.string().min(2).max(60),
  description: z.string().min(3).max(300),
  amount: z.number().min(0.01).max(100000),
  expenseDate: dateStr,
  receiptName: z.string().max(200).nullish(),
  isReimbursable: z.boolean().default(true),
});

/** Build a local-midnight Date from a yyyy-mm-dd string (matches @db.Date seeds). */
function localDate(value: string): Date | null {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** POST /api/employee/expenses — submit a claim (always created as PENDING). */
export async function POST(req: NextRequest) {
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
  const data = parsed.data;

  // 1. Date sanity — allow dated-ahead claims up to 7 days.
  const expenseDate = localDate(data.expenseDate);
  if (!expenseDate) {
    return NextResponse.json(
      { error: "Invalid expense date", fields: { expenseDate: "Use a valid date" } },
      { status: 422 }
    );
  }
  const maxAhead = new Date();
  maxAhead.setHours(0, 0, 0, 0);
  maxAhead.setDate(maxAhead.getDate() + 7);
  if (expenseDate > maxAhead) {
    return NextResponse.json(
      {
        error: "Expense date is too far in the future",
        fields: { expenseDate: "Claims can be dated at most 7 days ahead" },
      },
      { status: 422 }
    );
  }

  // 2. Create the claim — the employee is always the signed-in person, and no
  //    receipt bytes are ever stored (receiptName metadata only).
  const row = await prisma.expense.create({
    data: {
      organisationId,
      employeeId,
      category: data.category.trim(),
      description: data.description.trim(),
      amount: data.amount,
      expenseDate,
      receiptName: data.receiptName?.trim() || null,
      isReimbursable: data.isReimbursable,
      status: "PENDING",
      submittedAt: new Date(),
    },
  });

  // 3. Audit
  await writeOrgAudit({
    organisationId,
    action: "self.expense.submitted",
    category: "self-service",
    description: `Submitted ${row.category} claim for $${data.amount.toFixed(2)} (${data.expenseDate})`,
    entityType: "Expense",
    entityId: row.id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, item: { id: row.id, status: row.status } }, { status: 201 });
}
