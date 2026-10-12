import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(240).nullish(),
  /** Full replacement of the permission set. */
  permissionKeys: z.array(z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { assignments: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
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
  let grantedCount: number | null = null;

  await prisma.$transaction(async (tx) => {
    if (data.name !== undefined || data.description !== undefined) {
      await tx.role.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.description !== undefined ? { description: data.description || null } : {}),
        },
      });
    }

    if (data.permissionKeys !== undefined) {
      const permissions = await tx.permission.findMany({
        where: { key: { in: data.permissionKeys } },
        select: { id: true },
      });
      grantedCount = permissions.length;

      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: id, permissionId: p.id, allowed: true })),
          skipDuplicates: true,
        });
      }
    }
  });

  await writeAudit({
    action: data.permissionKeys !== undefined ? "ROLE_PERMISSIONS_UPDATED" : "ROLE_UPDATED",
    category: "Security",
    severity: "WARNING",
    description:
      data.permissionKeys !== undefined
        ? `Replaced permission set for '${existing.name}' — now ${grantedCount} granted`
        : `Updated role '${existing.name}'`,
    entityType: "Role",
    entityId: id,
    metadata: { changes: data, grantedCount },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, granted: grantedCount });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { assignments: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  if (existing.isSystem) {
    return NextResponse.json(
      { error: "Built-in system roles cannot be deleted" },
      { status: 403 }
    );
  }

  if (existing._count.assignments > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${existing._count.assignments} user(s) hold this role` },
      { status: 409 }
    );
  }

  await prisma.role.delete({ where: { id } });

  await writeAudit({
    action: "ROLE_DELETED",
    category: "Security",
    severity: "WARNING",
    description: `Deleted role '${existing.name}'`,
    entityType: "Role",
    entityId: id,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
