import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const patchSchema = z.object({
  action: z.enum(["approve", "reject"]).optional(),
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "REIMBURSED"]).optional(),
  reason: z.string().trim().min(3, "A reason is required").max(500).optional(),
  category: z.string().trim().min(1, "Category is required").max(60).optional(),
  description: z.string().trim().min(3, "Description is required").max(300).optional(),
  amount: z.coerce.number().positive("Amount must be greater than zero").optional(),
  expenseDate: dateStr.optional(),
  receiptName: z.string().max(200).nullish(),
  employeeId: z.string().optional(),
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

function bad(message: string, fields?: Record<string, string>) {
  return NextResponse.json({ error: message, fields }, { status: 422 });
}

/** PATCH /api/org/expenses/[id] — approve, reject (with reason) or edit. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!expense || expense.organisationId !== organisationId) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  const d = parsed.data;

  const target =
    d.action === "approve"
      ? "APPROVED"
      : d.action === "reject"
        ? "REJECTED"
        : d.status;

  const now = new Date();
  const who = `${expense.employee.firstName} ${expense.employee.lastName}`;

  // ── Status transitions ──────────────────────────────────────────
  if (target === "APPROVED") {
    if (expense.status !== "PENDING") {
      return bad(`Only PENDING expenses can be approved — this one is ${expense.status}`);
    }
    const updated = await prisma.expense.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedById: auth.ctx.session.id,
        reviewedAt: now,
        reviewNotes: null,
      },
    });
    await writeOrgAudit({
      organisationId,
      action: "expense.approved",
      category: "expenses",
      description: `Approved ${expense.amount.toString()} ${expense.currency} claim for ${who}`,
      entityType: "Expense",
      entityId: id,
      metadata: { amount: Number(expense.amount), category: expense.category },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true, expense: updated });
  }

  if (target === "REJECTED") {
    if (!d.reason) {
      return bad("A reason is required to reject an expense", {
        reason: "Tell the employee why this is rejected",
      });
    }
    if (expense.status !== "PENDING" && expense.status !== "APPROVED") {
      return bad(`This expense is ${expense.status} and can no longer be rejected`);
    }
    const updated = await prisma.expense.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: auth.ctx.session.id,
        reviewedAt: now,
        reviewNotes: d.reason,
      },
    });
    await writeOrgAudit({
      organisationId,
      action: "expense.rejected",
      category: "expenses",
      severity: "WARNING",
      description: `Rejected ${expense.amount.toString()} ${expense.currency} claim for ${who}: ${d.reason}`,
      entityType: "Expense",
      entityId: id,
      metadata: { reason: d.reason, category: expense.category },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true, expense: updated });
  }

  if (target === "REIMBURSED") {
    if (expense.status !== "APPROVED") {
      return bad(`Only APPROVED expenses can be marked reimbursed — this one is ${expense.status}`);
    }
    const updated = await prisma.expense.update({
      where: { id },
      data: { status: "REIMBURSED", reimbursedAt: now },
    });
    await writeOrgAudit({
      organisationId,
      action: "expense.reimbursed",
      category: "expenses",
      description: `Marked ${expense.amount.toString()} ${expense.currency} claim for ${who} as reimbursed`,
      entityType: "Expense",
      entityId: id,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true, expense: updated });
  }

  // ── Plain edit (DRAFT / PENDING / APPROVED rows) ────────────────
  if (expense.status === "REIMBURSED") {
    return bad("Reimbursed expenses cannot be edited");
  }

  if (d.employeeId && d.employeeId !== expense.employeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: d.employeeId, organisationId },
      select: { id: true },
    });
    if (!employee) {
      return bad("Employee not found", { employeeId: "Unknown employee" });
    }
  }

  const resubmitting = target === "PENDING" && expense.status === "DRAFT";

  const updated = await prisma.expense.update({
    where: { id },
    data: {
      ...(d.employeeId !== undefined ? { employeeId: d.employeeId } : {}),
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.amount !== undefined ? { amount: d.amount } : {}),
      ...(d.expenseDate !== undefined ? { expenseDate: dayOnly(d.expenseDate) } : {}),
      ...(d.receiptName !== undefined ? { receiptName: d.receiptName || null } : {}),
      ...(target !== undefined ? { status: target } : {}),
      ...(resubmitting ? { submittedAt: now } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "expense.updated",
    category: "expenses",
    description: `Updated expense claim for ${who}`,
    entityType: "Expense",
    entityId: id,
    metadata: { fromStatus: expense.status, toStatus: updated.status },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, expense: updated });
}

/** DELETE /api/org/expenses/[id] — remove a claim that has not been paid out. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const { id } = await params;
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: { employee: { select: { firstName: true, lastName: true } } },
  });
  if (!expense || expense.organisationId !== organisationId) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  if (expense.status === "REIMBURSED") {
    return NextResponse.json(
      { error: "Reimbursed expenses cannot be deleted" },
      { status: 422 }
    );
  }

  await prisma.expense.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "expense.deleted",
    category: "expenses",
    severity: "WARNING",
    description: `Deleted ${expense.amount.toString()} ${expense.currency} claim for ${expense.employee.firstName} ${expense.employee.lastName}`,
    entityType: "Expense",
    entityId: id,
    metadata: { amount: Number(expense.amount), status: expense.status },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
