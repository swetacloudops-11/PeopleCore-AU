import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { payrollApi, fieldErrors, clientIp } from "@/lib/payroll-api";
import { writeOrgAudit } from "@/lib/org-audit";

const updateSchema = z.object({
  id: z.string().min(1),
  value: z.string().max(4000),
});

const patchSchema = z.object({
  updates: z.array(updateSchema).min(1).max(100),
});

/** GET /api/payroll/settings?group=payroll — OrgSetting rows (secrets masked). */
export async function GET(req: NextRequest) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;

  const group = new URL(req.url).searchParams.get("group") ?? undefined;

  const rows = await prisma.orgSetting.findMany({
    where: { organisationId: auth.ctx.organisationId, ...(group ? { group } : {}) },
    orderBy: [{ group: "asc" }, { key: "asc" }],
    select: {
      id: true,
      group: true,
      key: true,
      label: true,
      value: true,
      dataType: true,
      isSecret: true,
    },
  });

  return NextResponse.json({
    settings: rows.map((s) => ({ ...s, value: s.isSecret ? "••••••••" : s.value })),
  });
}

/**
 * PATCH /api/payroll/settings — bulk update payroll settings.
 * Each id is verified against the tenant before it is touched, values are
 * type-checked against the setting's dataType, and every change is audited.
 */
export async function PATCH(req: NextRequest) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;
  const { organisationId } = auth.ctx;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const skipped: string[] = [];
  const changed: Array<{ id: string; key: string; label: string; from: string; to: string }> = [];

  for (const u of parsed.data.updates) {
    const setting = await prisma.orgSetting.findFirst({
      where: { id: u.id, organisationId },
    });
    if (!setting) {
      skipped.push(u.id);
      continue;
    }
    if (setting.dataType === "number" && Number.isNaN(Number(u.value))) {
      skipped.push(u.id);
      continue;
    }
    if (setting.dataType === "boolean" && !["true", "false"].includes(u.value)) {
      skipped.push(u.id);
      continue;
    }
    if (u.value === setting.value) continue;

    await prisma.orgSetting.update({ where: { id: setting.id }, data: { value: u.value } });
    changed.push({
      id: setting.id,
      key: setting.key,
      label: setting.label,
      from: setting.value,
      to: u.value,
    });

    await writeOrgAudit({
      organisationId,
      action: "payroll.settings.updated",
      category: "payroll",
      description: `Updated payroll setting "${setting.label}"`,
      entityType: "OrgSetting",
      entityId: setting.id,
      metadata: { key: setting.key, from: setting.value, to: u.value },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
  }

  return NextResponse.json({ ok: true, updated: changed.length, skipped });
}
