import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, homeFor } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ua = req.headers.get("user-agent") ?? undefined;

  if (!user) {
    await writeAudit({
      action: "AUTH_LOGIN_FAILED",
      category: "security",
      severity: "WARNING",
      description: `Failed sign-in attempt for unknown email ${email}`,
      ipAddress: ip,
      userAgent: ua,
    });
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await writeAudit({
      action: "AUTH_LOGIN_FAILED",
      category: "security",
      severity: "WARNING",
      description: `Failed sign-in attempt for ${email}`,
      entityType: "User",
      entityId: user.id,
      ipAddress: ip,
      userAgent: ua,
    });
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  if (user.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "This account is suspended. Contact the platform owner." },
      { status: 403 }
    );
  }

  const assignments = await prisma.roleAssignment.findMany({
    where: { userId: user.id },
    include: { role: { select: { key: true, organisationId: true } } },
  });
  const roles = assignments.map((a) => a.role.key);

  // Organisation-scoped accounts carry their tenant id so every /org query
  // can be scoped; platform accounts have it null.
  const organisationId: string | null = user.organisationId ?? null;
  let organisationName: string | null = null;
  if (organisationId) {
    const org = await prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { name: true },
    });
    organisationName = org?.name ?? null;
  }

  const sessionRoles = roles.length
    ? roles
    : [organisationId ? "ORG_ADMIN" : "SUPER_ADMIN"];

  const sessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: sessionRoles,
    organisationId,
    organisationName,
  };

  await createSession(sessionUser);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const destination = homeFor(sessionUser);
  const consoleName = destination.startsWith("/hr")
    ? "HR Admin console"
    : organisationId
    ? "Organisation console"
    : "Super Admin console";

  await writeAudit({
    action: "AUTH_LOGIN_SUCCESS",
    category: "security",
    severity: "INFO",
    description: organisationId
      ? `${email} signed in to the ${consoleName} (${organisationName})`
      : `${email} signed in to the Super Admin console`,
    entityType: "User",
    entityId: user.id,
    organisationId: organisationId ?? undefined,
    ipAddress: ip,
    userAgent: ua,
  });

  return NextResponse.json({ ok: true, destination });
}
