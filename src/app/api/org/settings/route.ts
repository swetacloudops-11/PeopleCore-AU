import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const createSchema = z.object({
  group: z.string().min(1).max(40),
  key: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores"),
  label: z.string().min(2).max(120),
  value: z.string().max(4000).default(""),
  dataType: z.enum(["string", "number", "boolean", "json"]).default("string"),
  isSecret: z.boolean().optional(),
});

/** POST /api/org/settings — create an OrgSetting for this organisation. */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const organisationId = auth.ctx.organisationId;

  if (data.dataType === "number" && Number.isNaN(Number(data.value))) {
    return NextResponse.json(
      { error: "Invalid payload", fields: { value: "Value must be a number" } },
      { status: 422 }
    );
  }

  const clash = await prisma.orgSetting.findUnique({
    where: { organisationId_key: { organisationId, key: data.key } },
    select: { id: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: "A setting with that key already exists", fields: { key: "Already in use" } },
      { status: 409 }
    );
  }

  const setting = await prisma.orgSetting.create({
    data: {
      organisationId,
      group: data.group,
      key: data.key,
      label: data.label,
      value: data.value,
      dataType: data.dataType,
      isSecret: data.isSecret ?? false,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "ORG_SETTING_CREATED",
    category: "Organisation Settings",
    severity: data.isSecret ? "WARNING" : "INFO",
    description: `Created ${data.group} setting '${data.label}'`,
    entityType: "OrgSetting",
    entityId: setting.id,
    // Never record a secret value.
    metadata: { key: data.key, group: data.group, value: data.isSecret ? "[redacted]" : data.value },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json(
    {
      ok: true,
      id: setting.id,
      setting: {
        id: setting.id,
        key: setting.key,
        label: setting.label,
        // Secrets are echoed back masked, never raw.
        value: setting.isSecret ? "••••••••" : setting.value,
        dataType: setting.dataType,
        isSecret: setting.isSecret,
        group: setting.group,
      },
    },
    { status: 201 }
  );
}
