import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "peoplecore-super-admin-secret-change-me"
);

const schema = z.object({
  userId: z.string().min(1),
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(10, "New password must be at least 10 characters"),
});

export async function PATCH(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? "Invalid payload" },
      { status: 422 }
    );
  }

  const { userId, currentPassword, newPassword } = parsed.data;

  // A user may only change their own password from the settings screen.
  if (userId !== session.id) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 401 }
    );
  }

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "New password must differ from the current one" },
      { status: 422 }
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  // Revoke every OTHER session so a password change forces re-authentication
  // elsewhere, while keeping the session performing the change alive.
  const store = await cookies();
  const token = store.get("pc_session")?.value;
  let currentSid: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret);
      currentSid = (payload.sid as string) ?? null;
    } catch {
      currentSid = null;
    }
  }

  await prisma.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(currentSid ? { NOT: { token: currentSid } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  await writeAudit({
    action: "PASSWORD_CHANGED",
    category: "Security",
    severity: "WARNING",
    description: `${user.email} changed their account password`,
    entityType: "User",
    entityId: userId,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
