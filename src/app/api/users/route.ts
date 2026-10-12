import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(10, "Password must be at least 10 characters"),
  roleKey: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
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
  const email = data.email.trim().toLowerCase();

  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash) {
    return NextResponse.json(
      { error: "A user with that email already exists", fields: { email: "Already in use" } },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.create({
    data: {
      name: data.name.trim(),
      email,
      passwordHash,
      status: "ACTIVE",
    },
  });

  let assignedRole: string | null = null;
  if (data.roleKey) {
    const role = await prisma.role.findUnique({ where: { key: data.roleKey } });
    if (role) {
      await prisma.roleAssignment.create({
        data: { userId: user.id, roleId: role.id },
      });
      assignedRole = role.name;
    }
  }

  await writeAudit({
    action: "USER_CREATED",
    category: "Security",
    severity: "WARNING",
    description: `Created console user ${email}${assignedRole ? ` with role ${assignedRole}` : ""}`,
    entityType: "User",
    entityId: user.id,
    metadata: { email, role: data.roleKey ?? null },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, id: user.id }, { status: 201 });
}
