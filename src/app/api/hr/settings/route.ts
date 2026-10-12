import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";

const updateSchema = z.object({
  id: z.string().min(1),
  value: z.string().max(4000),
  isEnabled: z.boolean().optional(),
});

const createSchema = z.object({
  group: z.string().min(1).max(40),
  key: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_:]+$/, "Use lowercase letters, numbers, underscores or colons"),
  label: z.string().min(2).max(120),
  value: z.string().max(4000).default(""),
  dataType: z.enum(["string", "number", "boolean", "json"]).default("string"),
  isSecret: z.boolean().optional(),
});

const patchSchema = z
  .object({
    updates: z.array(updateSchema).min(1).max(100).optional(),
    create: createSchema.optional(),
  })
  .refine((d) => Boolean(d.updates?.length || d.create), {
    message: "Provide updates or create",
  });

/** GET /api/hr/settings?group=hr — OrgSetting rows for the tenant (secrets masked). */
export async function GET(req: NextRequest) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;

  const group = new URL(req.url).searchParams.get("group") ?? undefined;

  const rows = await prisma.orgSetting.findMany({
    where: { organisationId: auth.ctx.organisationId, ...(group ? { group } : {}) },
    orderBy: { key: "asc" },
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
    settings: rows.map((s) => ({
      ...s,
      value: s.isSecret ? "••••••••" : s.value,
    })),
  });
}

/**
 * PATCH /api/hr/settings — bulk update settings, or create one.
 *
 * Accepts `{ updates: [{ id, value }] }` and/or `{ create: {…} }`. Each id is
 * verified against the tenant before it is touched — it may resolve to an
 * OrgSetting or a LeaveRule. Every change is audited.
 */
export async function PATCH(req: NextRequest) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const data = parsed.data;

  // ── create ──────────────────────────────────────────────────────
  if (data.create) {
    const c = data.create;

    const clash = await prisma.orgSetting.findUnique({
      where: { organisationId_key: { organisationId, key: c.key } },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: "A setting with that key already exists", fields: { key: "Already in use" } },
        { status: 409 }
      );
    }

    if (c.dataType === "number" && Number.isNaN(Number(c.value))) {
      return NextResponse.json(
        { error: "Invalid payload", fields: { value: "Value must be a number" } },
        { status: 422 }
      );
    }

    const created = await prisma.orgSetting.create({
      data: {
        organisationId,
        group: c.group,
        key: c.key,
        label: c.label,
        value: c.value,
        dataType: c.dataType,
        isSecret: c.isSecret ?? false,
      },
    });

    await writeOrgAudit({
      organisationId,
      action: "HR_SETTING_CREATED",
      category: "HR Settings",
      severity: created.isSecret ? "WARNING" : "INFO",
      description: `Created ${c.group} setting '${c.label}'`,
      entityType: "OrgSetting",
      entityId: created.id,
      metadata: { key: c.key, group: c.group, value: created.isSecret ? "[redacted]" : c.value },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json(
      {
        ok: true,
        item: {
          id: created.id,
          key: created.key,
          label: created.label,
          value: created.isSecret ? "••••••••" : created.value,
          dataType: created.dataType,
          isSecret: created.isSecret,
          group: created.group,
        },
      },
      { status: 201 }
    );
  }

  // ── bulk updates ────────────────────────────────────────────────
  const skipped: string[] = [];
  let updated = 0;

  for (const u of data.updates ?? []) {
    // 1. OrgSetting owned by this tenant?
    const setting = await prisma.orgSetting.findFirst({ where: { id: u.id, organisationId } });
    if (setting) {
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
      updated += 1;

      await writeOrgAudit({
        organisationId,
        action: "HR_SETTING_UPDATED",
        category: "HR Settings",
        severity: setting.isSecret ? "WARNING" : "INFO",
        description: `Updated ${setting.group} setting '${setting.label}'`,
        entityType: "OrgSetting",
        entityId: setting.id,
        metadata: {
          key: setting.key,
          ...(setting.isSecret
            ? { from: "[redacted]", to: "[redacted]" }
            : { from: setting.value, to: u.value }),
        },
        ipAddress: clientIp(req),
        userAgent: req.headers.get("user-agent") ?? undefined,
      });
      continue;
    }

    // 2. LeaveRule owned by this tenant?
    const rule = await prisma.leaveRule.findFirst({ where: { id: u.id, organisationId } });
    if (!rule) {
      skipped.push(u.id);
      continue;
    }
    if (rule.dataType === "number" && Number.isNaN(Number(u.value))) {
      skipped.push(u.id);
      continue;
    }
    if (u.value === rule.value && u.isEnabled === undefined) continue;

    await prisma.leaveRule.update({
      where: { id: rule.id },
      data: {
        ...(u.value !== rule.value ? { value: u.value } : {}),
        ...(u.isEnabled !== undefined ? { isEnabled: u.isEnabled } : {}),
      },
    });
    updated += 1;

    await writeOrgAudit({
      organisationId,
      action: "HR_LEAVE_RULE_UPDATED",
      category: "HR Settings",
      severity: "INFO",
      description: `Updated leave rule '${rule.name}'`,
      entityType: "LeaveRule",
      entityId: rule.id,
      metadata: { key: rule.key, from: rule.value, to: u.value },
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
  }

  return NextResponse.json({ ok: true, updated, skipped });
}
