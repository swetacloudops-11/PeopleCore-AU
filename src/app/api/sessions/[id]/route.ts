import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

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
  const session = await prisma.userSession.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.revokedAt) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await prisma.userSession.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  await writeAudit({
    action: "SESSION_REVOKED",
    category: "Security",
    severity: "WARNING",
    description: `Revoked active session for ${session.user.email}`,
    entityType: "UserSession",
    entityId: id,
    metadata: { ip: session.ip, userAgent: session.userAgent },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
