import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const schema = z.object({ resolved: z.boolean() });

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
  const existing = await prisma.errorLog.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Error not found" }, { status: 404 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  await prisma.errorLog.update({ where: { id }, data: { resolved: parsed.data.resolved } });

  await writeAudit({
    action: parsed.data.resolved ? "ERROR_RESOLVED" : "ERROR_REOPENED",
    category: "Platform Diagnostics",
    severity: "INFO",
    description: `${parsed.data.resolved ? "Marked" : "Reopened"} error '${existing.message.slice(0, 80)}'`,
    entityType: "ErrorLog",
    entityId: id,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
