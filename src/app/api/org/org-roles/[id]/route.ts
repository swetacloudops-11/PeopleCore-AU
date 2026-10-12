import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(240).nullish(),
  /** Full replacement of the granted permission set. */
  permissionKeys: z.array(z.string()).optional(),
});

/** Loads a role and enforces it belongs to the calling organisation. */
async function loadRole(id: string, organisationId: string) {
  const role = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { assignments: true, rolePermissions: true } } },
  });
  if (!role || role.organisationId !== organisationId) return null;
  return role;
}

/** PATCH /api/org/org-roles/[id] — rename, re-describe, replace permissions. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const existing = await loadRole(id, organisationId);
  if (!existing) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const data = parsed.data;
  let granted: number | null = null;

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
      granted = permissions.length;

      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: id, permissionId: p.id, allowed: true })),
          skipDuplicates: true,
        });
      }
    }
  });

  await writeOrgAudit({
    organisationId,
    action: data.permissionKeys !== undefined ? "ORG_ROLE_PERMISSIONS_UPDATED" : "ORG_ROLE_UPDATED",
    category: "User Management",
    severity: "WARNING",
    description:
      data.permissionKeys !== undefined
        ? `Replaced permission set for '${existing.name}' — now ${granted} granted`
        : `Updated role '${existing.name}'`,
    entityType: "Role",
    entityId: id,
    metadata: { granted },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, granted });
}

/** DELETE /api/org/org-roles/[id] — blocked for system roles and roles in use. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const existing = await loadRole(id, organisationId);
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

  await writeOrgAudit({
    organisationId,
    action: "ORG_ROLE_DELETED",
    category: "User Management",
    severity: "WARNING",
    description: `Deleted role '${existing.name}'`,
    entityType: "Role",
    entityId: id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
