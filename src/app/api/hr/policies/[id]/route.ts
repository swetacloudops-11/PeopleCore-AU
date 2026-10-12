import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const dateStr = z.string().regex(DATE_RE, "Use a valid date");

const patchSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  content: z.string().trim().min(10).max(40000).optional(),
  version: z.string().trim().min(1).max(20).optional(),
  effectiveDate: dateStr.optional(),
  reviewDate: z.union([dateStr, z.literal(""), z.null()]).optional(),
  isMandatory: z.boolean().optional(),
});

function localDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** PATCH /api/hr/policies/[id] — update a policy owned by this tenant. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;
  const { id } = await params;

  const existing = await prisma.policy.findFirst({ where: { id, organisationId } });
  if (!existing) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;

  const updated = await prisma.policy.update({
    where: { id },
    data: {
      ...(d.title !== undefined ? { title: d.title.trim() } : {}),
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.content !== undefined ? { content: d.content } : {}),
      ...(d.version !== undefined ? { version: d.version.trim() } : {}),
      ...(d.effectiveDate !== undefined ? { effectiveDate: localDate(d.effectiveDate) } : {}),
      ...(d.reviewDate !== undefined
        ? { reviewDate: d.reviewDate ? localDate(d.reviewDate) : null }
        : {}),
      ...(d.isMandatory !== undefined ? { isMandatory: d.isMandatory } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "HR_POLICY_UPDATED",
    category: "policies",
    description: `Updated policy '${updated.title}' (v${updated.version})`,
    entityType: "Policy",
    entityId: id,
    metadata: { version: updated.version },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, item: updated });
}

/** DELETE /api/hr/policies/[id] — delete a policy and its acknowledgements. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;
  const { id } = await params;

  const existing = await prisma.policy.findFirst({
    where: { id, organisationId },
    include: { _count: { select: { acknowledgements: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  await prisma.policy.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "HR_POLICY_DELETED",
    category: "policies",
    severity: "WARNING",
    description: `Deleted policy '${existing.title}' with ${existing._count.acknowledgements} acknowledgement(s)`,
    entityType: "Policy",
    entityId: id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
