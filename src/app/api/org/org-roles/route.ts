import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";
import { slugify } from "@/lib/format";

const createSchema = z.object({
  name: z.string().min(2, "Name is too short").max(60),
  description: z.string().max(240).nullish(),
  permissionKeys: z.array(z.string()).optional(),
});

/** Role keys are globally unique, so mint one derived from the name. */
async function uniqueKey(name: string): Promise<string> {
  const base = slugify(name) || "role";
  let candidate = base;
  for (let i = 2; i < 50; i++) {
    const taken = await prisma.role.findUnique({
      where: { key: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

/** POST /api/org/org-roles — create an organisation-scoped role. */
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
  const key = await uniqueKey(data.name);

  const role = await prisma.role.create({
    data: {
      key,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      organisationId,
      isSystem: false,
    },
    select: { id: true },
  });

  let granted = 0;
  if (data.permissionKeys?.length) {
    const permissions = await prisma.permission.findMany({
      where: { key: { in: data.permissionKeys } },
      select: { id: true },
    });
    granted = permissions.length;
    if (permissions.length) {
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id, allowed: true })),
        skipDuplicates: true,
      });
    }
  }

  await writeOrgAudit({
    organisationId,
    action: "ORG_ROLE_CREATED",
    category: "User Management",
    severity: "WARNING",
    description: `Created role '${data.name}' with ${granted} permission(s)`,
    entityType: "Role",
    entityId: role.id,
    metadata: { key, granted },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, id: role.id, key, granted }, { status: 201 });
}
