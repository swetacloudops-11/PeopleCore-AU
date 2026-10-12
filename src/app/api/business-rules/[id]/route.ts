import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const schema = z.object({
  value: z.string().max(2000).optional(),
  isEnabled: z.boolean().optional(),
});

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

  const existing = await prisma.businessRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }
  if (existing.isReadOnly) {
    return NextResponse.json({ error: "This rule is read-only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const data: { value?: string; isEnabled?: boolean } = {};

  if (parsed.data.value !== undefined) {
    const next = parsed.data.value;

    // Reject values that don't match the rule's declared data type.
    if (existing.dataType === "NUMBER" && (next.trim() === "" || Number.isNaN(Number(next)))) {
      return NextResponse.json({ error: "Value must be a number" }, { status: 422 });
    }
    if (existing.dataType === "BOOLEAN" && !["true", "false"].includes(next.trim().toLowerCase())) {
      return NextResponse.json({ error: 'Value must be "true" or "false"' }, { status: 422 });
    }
    if (existing.dataType === "JSON") {
      try {
        JSON.parse(next);
      } catch {
        return NextResponse.json({ error: "Value must be valid JSON" }, { status: 422 });
      }
    }

    if (next !== existing.value) data.value = next;
  }
  if (parsed.data.isEnabled !== undefined && parsed.data.isEnabled !== existing.isEnabled) {
    data.isEnabled = parsed.data.isEnabled;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const updated = await prisma.businessRule.update({ where: { id }, data });

  await writeAudit({
    action: "BUSINESS_RULE_UPDATED",
    category: "System Configuration",
    severity: "INFO",
    description: `Updated business rule '${existing.name}' (${
      data.value !== undefined ? `${existing.value} → ${data.value}` : `enabled: ${data.isEnabled}`
    })`,
    entityType: "BusinessRule",
    entityId: id,
    metadata: { key: existing.key, changes: data },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, value: updated.value, isEnabled: updated.isEnabled });
}
