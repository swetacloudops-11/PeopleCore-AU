import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  value: z.string().max(4000).optional(),
  isEnabled: z.boolean().optional(),
});

/** PATCH /api/org/leave-rules/[id] — edit a LeaveRule owned by this tenant. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const existing = await prisma.leaveRule.findUnique({ where: { id } });
  if (!existing || existing.organisationId !== organisationId) {
    return NextResponse.json({ error: "Leave rule not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const { value, isEnabled } = parsed.data;
  if (value !== undefined && existing.dataType === "number" && Number.isNaN(Number(value))) {
    return NextResponse.json(
      { error: "Invalid payload", fields: { value: "Value must be a number" } },
      { status: 422 }
    );
  }

  if (value === undefined && isEnabled === undefined) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await prisma.leaveRule.update({
    where: { id },
    data: {
      ...(value !== undefined ? { value } : {}),
      ...(isEnabled !== undefined ? { isEnabled } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "ORG_LEAVE_RULE_UPDATED",
    category: "Organisation Settings",
    severity: "INFO",
    description:
      value !== undefined
        ? `Updated leave rule '${existing.name}' to ${value}${existing.unit ? ` ${existing.unit}` : ""}`
        : `${isEnabled ? "Enabled" : "Disabled"} leave rule '${existing.name}'`,
    entityType: "LeaveRule",
    entityId: id,
    metadata: {
      key: existing.key,
      ...(value !== undefined ? { from: existing.value, to: value } : {}),
      ...(isEnabled !== undefined ? { isEnabled } : {}),
    },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, value: value ?? existing.value, isEnabled: isEnabled ?? existing.isEnabled });
}
