import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const schema = z.object({ value: z.string().max(4000) });

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

  const existing = await prisma.globalSetting.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Setting not found" }, { status: 404 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const { value } = parsed.data;
  if (existing.dataType === "number" && Number.isNaN(Number(value))) {
    return NextResponse.json({ error: "Value must be a number" }, { status: 422 });
  }

  if (value === existing.value) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await prisma.globalSetting.update({ where: { id }, data: { value } });

  await writeAudit({
    action: "GLOBAL_SETTING_UPDATED",
    category: "System Configuration",
    severity: existing.isSecret ? "WARNING" : "INFO",
    description: `Updated global setting '${existing.label}'`,
    entityType: "GlobalSetting",
    entityId: id,
    // Never record the value of a secret setting in the audit trail.
    metadata: {
      key: existing.key,
      ...(existing.isSecret
        ? { value: "[redacted]" }
        : { from: existing.value, to: value }),
    },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, value });
}
