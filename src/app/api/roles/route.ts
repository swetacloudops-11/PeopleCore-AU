import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const schema = z.object({
  key: z.string().min(2).max(50),
  name: z.string().min(2).max(60),
  description: z.string().max(240).nullish(),
  permissionKeys: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const key = data.key.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_");

  const clash = await prisma.role.findUnique({ where: { key } });
  if (clash) {
    return NextResponse.json(
      { error: "A role with that key already exists", fields: { key: "Already in use" } },
      { status: 409 }
    );
  }

  const permissions = await prisma.permission.findMany({
    where: { key: { in: data.permissionKeys } },
    select: { id: true },
  });

  const role = await prisma.role.create({
    data: {
      key,
      name: data.name.trim(),
      description: data.description || null,
      isSystem: false,
      rolePermissions: {
        create: permissions.map((p) => ({ permissionId: p.id, allowed: true })),
      },
    },
  });

  await writeAudit({
    action: "ROLE_CREATED",
    category: "Security",
    severity: "INFO",
    description: `Created role '${role.name}' with ${permissions.length} permission(s)`,
    entityType: "Role",
    entityId: role.id,
    metadata: { key, permissions: data.permissionKeys },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, id: role.id }, { status: 201 });
}
