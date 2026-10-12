import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  action: z.literal("withdraw"),
});

/**
 * PATCH /api/employee/expenses/[id] — withdraw the signed-in person's own
 * PENDING expense claim (status returns to DRAFT). Ownership is verified
 * against ctx.employeeId; the employeeId is never accepted from the client.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;
  const { organisationId, employeeId } = auth.ctx;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const row = await prisma.expense.findFirst({
    where: { id, organisationId },
  });
  if (!row || row.employeeId !== employeeId) {
    return NextResponse.json({ error: "Expense claim not found" }, { status: 404 });
  }
  if (row.status !== "PENDING") {
    return NextResponse.json(
      { error: "Only pending claims can be withdrawn" },
      { status: 409 }
    );
  }

  const updated = await prisma.expense.update({
    where: { id },
    data: { status: "DRAFT" },
  });

  await writeOrgAudit({
    organisationId,
    action: "self.expense.withdrawn",
    category: "self-service",
    description: `Withdrew own ${row.category} claim ($${Number(row.amount).toFixed(2)})`,
    entityType: "Expense",
    entityId: id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
