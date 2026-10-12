import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  code: z.string().trim().min(2).max(12).optional(),
  unit: z.enum(["DAYS", "HOURS"]).optional(),
  isPaid: z.boolean().optional(),
  accrualRate: z.coerce.number().min(0).max(365).optional(),
  maxCarryOver: z.coerce.number().min(0).max(365).optional(),
  requiresApproval: z.boolean().optional(),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #6366f1")
    .optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/hr/leave-types/[id] — edit or toggle a leave type. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;
  const { id } = await params;

  const existing = await prisma.leaveType.findFirst({
    where: { id, organisationId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;
  const code = d.code?.trim().toUpperCase();

  if (code && code !== existing.code) {
    const dupe = await prisma.leaveType.findFirst({
      where: { organisationId, code, id: { not: id } },
      select: { id: true },
    });
    if (dupe) {
      return NextResponse.json(
        { error: "That code is already in use", fields: { code: "Already in use" } },
        { status: 422 }
      );
    }
  }

  await prisma.leaveType.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name.trim() } : {}),
      ...(code !== undefined ? { code } : {}),
      ...(d.unit !== undefined ? { unit: d.unit } : {}),
      ...(d.isPaid !== undefined ? { isPaid: d.isPaid } : {}),
      ...(d.accrualRate !== undefined ? { accrualRate: d.accrualRate } : {}),
      ...(d.maxCarryOver !== undefined ? { maxCarryOver: d.maxCarryOver } : {}),
      ...(d.requiresApproval !== undefined ? { requiresApproval: d.requiresApproval } : {}),
      ...(d.colour !== undefined ? { colour: d.colour } : {}),
      ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "HR_LEAVE_TYPE_UPDATED",
    category: "leave",
    description: `Updated leave type '${existing.name}' (${existing.code})`,
    entityType: "LeaveType",
    entityId: id,
    metadata: { changes: d },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/hr/leave-types/[id] — remove a leave type that isn't in use. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;
  const { id } = await params;

  const existing = await prisma.leaveType.findFirst({
    where: { id, organisationId },
    include: { _count: { select: { requests: true, balances: true, rules: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
  }

  const inUse =
    existing._count.requests + existing._count.balances + existing._count.rules;
  if (inUse > 0) {
    return NextResponse.json(
      { error: "This leave type is in use — disable it instead of deleting." },
      { status: 409 }
    );
  }

  await prisma.leaveType.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "HR_LEAVE_TYPE_DELETED",
    category: "leave",
    severity: "WARNING",
    description: `Deleted leave type '${existing.name}' (${existing.code})`,
    entityType: "LeaveType",
    entityId: id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
