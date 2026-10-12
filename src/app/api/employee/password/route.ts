import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(100, "New password is too long"),
});

/**
 * PATCH /api/employee/password — change the signed-in account's own password.
 * The user id always comes from the session; passwords are never logged.
 */
export async function PATCH(req: NextRequest) {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;
  const { organisationId, session } = auth.ctx;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  await writeOrgAudit({
    organisationId,
    action: "self.password.changed",
    category: "self-service",
    description: `${user.email} changed their account password`,
    entityType: "User",
    entityId: user.id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
