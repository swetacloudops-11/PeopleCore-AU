import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

/** GET /api/org/users — organisation-scoped user list (platform users excluded). */
export async function GET() {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const users = await prisma.user.findMany({
    where: { organisationId: auth.ctx.organisationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      roleAssignments: {
        select: { role: { select: { id: true, key: true, name: true } } },
      },
      employeeProfile: {
        select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      },
    },
  });

  return NextResponse.json({ users });
}

const createSchema = z.object({
  name: z.string().min(2, "Name is too short").max(80),
  email: z.string().email("Enter a valid email address"),
  roleKey: z.string().nullish(),
  /** Optional — when omitted an invite password is generated and returned once. */
  password: z.string().min(10, "Password must be at least 10 characters").optional(),
});

const randomPassword = () => `Pc-${randomBytes(6).toString("base64url")}`;

/** POST /api/org/users — create (invite) a user inside this organisation. */
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
  const email = data.email.trim().toLowerCase();
  const organisationId = auth.ctx.organisationId;

  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash) {
    return NextResponse.json(
      { error: "A user with that email already exists", fields: { email: "Already in use" } },
      { status: 409 }
    );
  }

  // The role must be one of THIS organisation's roles.
  let role: { id: string; key: string; name: string } | null = null;
  if (data.roleKey) {
    const found = await prisma.role.findFirst({
      where: { key: data.roleKey, organisationId },
      select: { id: true, key: true, name: true },
    });
    if (!found) {
      return NextResponse.json(
        { error: "Unknown role", fields: { roleKey: "Not a role in this organisation" } },
        { status: 422 }
      );
    }
    role = found;
  }

  const generated = !data.password;
  const password = data.password ?? randomPassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name: data.name.trim(),
      email,
      passwordHash,
      status: "ACTIVE",
      organisationId,
      ...(role ? { roleAssignments: { create: { roleId: role.id } } } : {}),
    },
    select: { id: true },
  });

  await writeOrgAudit({
    organisationId,
    action: "ORG_USER_INVITED",
    category: "User Management",
    severity: "WARNING",
    description: `Invited ${email}${role ? ` with role ${role.name}` : ""}`,
    entityType: "User",
    entityId: user.id,
    metadata: { email, roleKey: role?.key ?? null, generatedPassword: generated },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json(
    {
      ok: true,
      id: user.id,
      invite: {
        name: data.name.trim(),
        email,
        role: role?.name ?? "No role",
        // Returned exactly once so the admin can hand it over securely.
        tempPassword: generated ? password : null,
      },
    },
    { status: 201 }
  );
}
