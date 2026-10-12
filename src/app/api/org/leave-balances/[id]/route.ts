import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const schema = z.object({
  entitlement: z.coerce.number().min(0).max(1000).optional(),
  taken: z.coerce.number().min(0).max(1000).optional(),
  pending: z.coerce.number().min(0).max(1000).optional(),
  carriedOver: z.coerce.number().min(0).max(1000).optional(),
});

/** PATCH /api/org/leave-balances/[id] — adjust one employee's balance figures. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 422 });
  }

  const row = await prisma.leaveBalance.findUnique({
    where: { id },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      leaveType: { select: { name: true } },
    },
  });
  if (!row || row.organisationId !== organisationId) {
    return NextResponse.json({ error: "Leave balance not found" }, { status: 404 });
  }

  const updated = await prisma.leaveBalance.update({ where: { id }, data: parsed.data });

  await writeOrgAudit({
    organisationId,
    action: "LEAVE_BALANCE_ADJUSTED",
    category: "Leave",
    description: `Adjusted ${row.leaveType.name} balance for ${row.employee.firstName} ${row.employee.lastName} (${row.year})`,
    entityType: "LeaveBalance",
    entityId: id,
    metadata: parsed.data,
    ipAddress: clientIp(req),
  });

  return NextResponse.json({
    ok: true,
    balance: {
      id: updated.id,
      entitlement: Number(updated.entitlement),
      taken: Number(updated.taken),
      pending: Number(updated.pending),
      carriedOver: Number(updated.carriedOver),
    },
  });
}
