import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  label: z.string().min(2).max(120).optional(),
  value: z.string().max(4000).optional(),
});

/** PATCH /api/org/settings/[id] — update an OrgSetting owned by this tenant. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const existing = await prisma.orgSetting.findUnique({ where: { id } });
  // Cross-tenant guard — other orgs' settings 404 here.
  if (!existing || existing.organisationId !== organisationId) {
    return NextResponse.json({ error: "Setting not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const { label, value } = parsed.data;

  if (value !== undefined && existing.dataType === "number" && Number.isNaN(Number(value))) {
    return NextResponse.json(
      { error: "Invalid payload", fields: { value: "Value must be a number" } },
      { status: 422 }
    );
  }
  if (value !== undefined && existing.dataType === "boolean" && !["true", "false"].includes(value)) {
    return NextResponse.json(
      { error: "Invalid payload", fields: { value: "Value must be true or false" } },
      { status: 422 }
    );
  }

  if (
    (label === undefined || label === existing.label) &&
    (value === undefined || value === existing.value)
  ) {
    return NextResponse.json({
      ok: true,
      unchanged: true,
      value: existing.isSecret ? "••••••••" : existing.value,
    });
  }

  await prisma.orgSetting.update({
    where: { id },
    data: {
      ...(label !== undefined ? { label } : {}),
      ...(value !== undefined ? { value } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "ORG_SETTING_UPDATED",
    category: "Organisation Settings",
    severity: existing.isSecret ? "WARNING" : "INFO",
    description: `Updated ${existing.group} setting '${existing.label}'`,
    entityType: "OrgSetting",
    entityId: id,
    metadata: {
      key: existing.key,
      ...(existing.isSecret
        ? { from: "[redacted]", to: "[redacted]" }
        : { from: existing.value, to: value ?? existing.value }),
    },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  // Secrets are never echoed back in raw form.
  return NextResponse.json({
    ok: true,
    value: existing.isSecret ? "••••••••" : (value ?? existing.value),
  });
}
