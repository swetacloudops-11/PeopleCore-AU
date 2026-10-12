import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";

const createSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  code: z.string().trim().min(2, "Code is required").max(12),
  unit: z.enum(["DAYS", "HOURS"]).default("DAYS"),
  isPaid: z.boolean().default(true),
  accrualRate: z.coerce.number().min(0).max(365).default(0),
  maxCarryOver: z.coerce.number().min(0).max(365).default(0),
  requiresApproval: z.boolean().default(true),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #6366f1")
    .default("#6366f1"),
  isActive: z.boolean().default(true),
});

/** GET /api/hr/leave-types — every leave type configured for this tenant. */
export async function GET() {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;

  const leaveTypes = await prisma.leaveType.findMany({
    where: { organisationId: auth.ctx.organisationId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { requests: true, balances: true } } },
  });

  return NextResponse.json({ leaveTypes });
}

/** POST /api/hr/leave-types — create a leave type. */
export async function POST(req: NextRequest) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;
  const code = d.code.trim().toUpperCase();

  const dupe = await prisma.leaveType.findFirst({
    where: { organisationId, code },
    select: { id: true },
  });
  if (dupe) {
    return NextResponse.json(
      { error: "That code is already in use", fields: { code: "Already in use" } },
      { status: 422 }
    );
  }

  const created = await prisma.leaveType.create({
    data: {
      organisationId,
      name: d.name.trim(),
      code,
      unit: d.unit,
      isPaid: d.isPaid,
      accrualRate: d.accrualRate,
      maxCarryOver: d.maxCarryOver,
      requiresApproval: d.requiresApproval,
      colour: d.colour,
      isActive: d.isActive,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "HR_LEAVE_TYPE_CREATED",
    category: "leave",
    description: `Created leave type '${created.name}' (${created.code})`,
    entityType: "LeaveType",
    entityId: created.id,
    metadata: { code, unit: d.unit, isPaid: d.isPaid },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, item: created }, { status: 201 });
}
