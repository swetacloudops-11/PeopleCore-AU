import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const schema = z.object({ isEnabled: z.boolean() });

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

  const existing = await prisma.notificationSetting.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const updated = await prisma.notificationSetting.update({
    where: { id },
    data: { isEnabled: parsed.data.isEnabled },
  });

  await writeAudit({
    action: "NOTIFICATION_UPDATED",
    category: "System Configuration",
    severity: "INFO",
    description: `${parsed.data.isEnabled ? "Enabled" : "Disabled"} notification '${existing.name}'`,
    entityType: "NotificationSetting",
    entityId: id,
    metadata: { key: existing.key, isEnabled: parsed.data.isEnabled },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, isEnabled: updated.isEnabled });
}
