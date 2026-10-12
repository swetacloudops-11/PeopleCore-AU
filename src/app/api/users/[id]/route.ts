import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  roleKey: z.string().nullish(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.user.findUnique({
    where: { id },
    include: { roleAssignments: { include: { role: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const data = parsed.data;

  // Never let an admin suspend or demote their own account.
  if (id === session.id && data.status === "SUSPENDED") {
    return NextResponse.json(
      { error: "You cannot suspend your own account" },
      { status: 409 }
    );
  }

  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.status !== undefined) patch.status = data.status;

  const notes: string[] = [];

  if (data.status && data.status !== existing.status) {
    notes.push(`status ${existing.status} → ${data.status}`);
    if (data.status === "SUSPENDED") {
      // Kill live sessions immediately on suspension.
      await prisma.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }
  if (data.name !== undefined && data.name.trim() !== existing.name) {
    notes.push(`renamed to ${data.name.trim()}`);
  }

  if (Object.keys(patch).length > 0) {
    await prisma.user.update({ where: { id }, data: patch });
  }

  // Role reassignment
  if (data.roleKey !== undefined) {
    const currentRoleKey = existing.roleAssignments[0]?.role.key ?? null;
    if (data.roleKey !== currentRoleKey) {
      await prisma.roleAssignment.deleteMany({ where: { userId: id } });
      if (data.roleKey) {
        const role = await prisma.role.findUnique({ where: { key: data.roleKey } });
        if (role) {
          await prisma.roleAssignment.create({ data: { userId: id, roleId: role.id } });
          notes.push(`role ${currentRoleKey ?? "none"} → ${role.key}`);
        }
      } else {
        notes.push(`role ${currentRoleKey ?? "none"} → none`);
      }
    }
  }

  if (notes.length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await writeAudit({
    action: data.status === "SUSPENDED" ? "USER_SUSPENDED" : data.status === "ACTIVE" ? "USER_ACTIVATED" : "USER_UPDATED",
    category: "Security",
    severity: data.status === "SUSPENDED" ? "WARNING" : "INFO",
    description: `Updated console user ${existing.email}: ${notes.join(", ")}`,
    entityType: "User",
    entityId: id,
    metadata: { changes: data },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (id === session.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 409 }
    );
  }

  const totalUsers = await prisma.user.count();
  if (totalUsers <= 1) {
    return NextResponse.json(
      { error: "At least one administrator must remain" },
      { status: 409 }
    );
  }

  await prisma.user.delete({ where: { id } });

  await writeAudit({
    action: "USER_DELETED",
    category: "Security",
    severity: "WARNING",
    description: `Deleted console user ${existing.email}`,
    entityType: "User",
    entityId: id,
    metadata: { email: existing.email },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
