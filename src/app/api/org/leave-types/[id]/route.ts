import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  accrualRate: z.number().min(0).max(365).optional(),
  maxCarryOver: z.number().min(0).max(365).optional(),
  isPaid: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #6366f1")
    .optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/org/leave-types/[id] — edit a LeaveType owned by this tenant. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const existing = await prisma.leaveType.findUnique({ where: { id } });
  if (!existing || existing.organisationId !== organisationId) {
    return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const data = parsed.data;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await prisma.leaveType.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.accrualRate !== undefined ? { accrualRate: data.accrualRate } : {}),
      ...(data.maxCarryOver !== undefined ? { maxCarryOver: data.maxCarryOver } : {}),
      ...(data.isPaid !== undefined ? { isPaid: data.isPaid } : {}),
      ...(data.requiresApproval !== undefined ? { requiresApproval: data.requiresApproval } : {}),
      ...(data.colour !== undefined ? { colour: data.colour } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "ORG_LEAVE_TYPE_UPDATED",
    category: "Organisation Settings",
    severity: "INFO",
    description: `Updated leave type '${existing.name}' (${existing.code})`,
    entityType: "LeaveType",
    entityId: id,
    metadata: { changes: data },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
