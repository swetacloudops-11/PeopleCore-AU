import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  /** Full replacement of the assigned role — null/empty clears it. */
  roleKey: z.string().nullish(),
});

/** PATCH /api/org/users/[id] — rename, re-role, suspend or activate. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const existing = await prisma.user.findUnique({
    where: { id },
    include: { roleAssignments: { include: { role: true } } },
  });
  // Cross-tenant guard: other organisations' users simply do not exist here.
  if (!existing || existing.organisationId !== organisationId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const isSelf = id === auth.ctx.session.id;

  if (isSelf && data.status === "SUSPENDED") {
    return NextResponse.json(
      { error: "You cannot suspend your own account" },
      { status: 409 }
    );
  }

  const notes: string[] = [];
  const patch: { name?: string; status?: "ACTIVE" | "SUSPENDED" } = {};

  if (data.name !== undefined && data.name.trim() !== existing.name) {
    patch.name = data.name.trim();
    notes.push(`renamed to ${patch.name}`);
  }

  if (data.status && data.status !== existing.status) {
    patch.status = data.status;
    notes.push(`status ${existing.status} → ${data.status}`);
  }

  if (Object.keys(patch).length > 0) {
    await prisma.user.update({ where: { id }, data: patch });
  }

  // Suspension must revoke live sessions immediately.
  if (patch.status === "SUSPENDED") {
    await prisma.userSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  if (data.roleKey !== undefined) {
    const nextKey = data.roleKey?.trim() || null;
    const currentKey = existing.roleAssignments[0]?.role.key ?? null;
    if (nextKey !== currentKey) {
      let nextRole: { id: string; key: string; name: string } | null = null;
      if (nextKey) {
        nextRole = await prisma.role.findFirst({
          where: { key: nextKey, organisationId },
          select: { id: true, key: true, name: true },
        });
        if (!nextRole) {
          return NextResponse.json(
            { error: "Unknown role", fields: { roleKey: "Not a role in this organisation" } },
            { status: 422 }
          );
        }
      }

      await prisma.roleAssignment.deleteMany({ where: { userId: id } });
      if (nextRole) {
        await prisma.roleAssignment.create({ data: { userId: id, roleId: nextRole.id } });
      }
      notes.push(`role ${currentKey ?? "none"} → ${nextKey ?? "none"}`);
    }
  }

  if (notes.length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await writeOrgAudit({
    organisationId,
    action:
      data.status === "SUSPENDED"
        ? "ORG_USER_SUSPENDED"
        : data.status === "ACTIVE"
        ? "ORG_USER_ACTIVATED"
        : "ORG_USER_UPDATED",
    category: "User Management",
    severity: data.status === "SUSPENDED" ? "WARNING" : "INFO",
    description: `Updated ${existing.email}: ${notes.join(", ")}`,
    entityType: "User",
    entityId: id,
    metadata: { changes: notes },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, notes });
}

/** DELETE /api/org/users/[id] — remove a user (never yourself). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing || existing.organisationId !== organisationId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (id === auth.ctx.session.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 409 }
    );
  }

  const orgUsers = await prisma.user.count({ where: { organisationId } });
  if (orgUsers <= 1) {
    return NextResponse.json(
      { error: "At least one user must remain in this organisation" },
      { status: 409 }
    );
  }

  await prisma.user.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "ORG_USER_DELETED",
    category: "User Management",
    severity: "WARNING",
    description: `Deleted user ${existing.email}`,
    entityType: "User",
    entityId: id,
    metadata: { email: existing.email },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
