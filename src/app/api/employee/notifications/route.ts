import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi } from "@/lib/employee-api";

/**
 * GET /api/employee/notifications — the signed-in employee's notifications:
 * rows targeted at them plus organisation-wide announcements.
 */
export async function GET() {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;

  const notifications = await prisma.orgNotification.findMany({
    where: {
      organisationId: auth.ctx.organisationId,
      OR: [{ userId: auth.ctx.session.id }, { userId: null }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ notifications });
}

const patchSchema = z.object({
  action: z.enum(["read", "read_all", "prefs"]),
  id: z.string().optional(),
  prefs: z.record(z.string(), z.boolean()).optional(),
});

/**
 * PATCH /api/employee/notifications — mark read, or save per-employee
 * notification preferences (stored as OrgSetting rows keyed by user).
 */
export async function PATCH(req: NextRequest) {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const { organisationId, session } = auth.ctx;

  if (parsed.data.action === "prefs") {
    const prefs = parsed.data.prefs ?? {};
    const allowed = [
      "shift_updates",
      "leave_updates",
      "payslip_ready",
      "task_reminders",
      "announcements",
      "email_digest",
    ];
    for (const key of allowed) {
      if (!(key in prefs)) continue;
      const settingKey = `empnotif:${session.id}:${key}`;
      const value = prefs[key] ? "true" : "false";
      await prisma.orgSetting.upsert({
        where: { organisationId_key: { organisationId, key: settingKey } },
        update: { value },
        create: {
          organisationId,
          key: settingKey,
          group: "employee-notification",
          label: `Notification preference: ${key}`,
          value,
          dataType: "boolean",
        },
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "read_all") {
    await prisma.orgNotification.updateMany({
      where: {
        organisationId,
        isRead: false,
        OR: [{ userId: session.id }, { userId: null }],
      },
      data: { isRead: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (!parsed.data.id) {
    return NextResponse.json({ error: "id is required" }, { status: 422 });
  }
  await prisma.orgNotification.updateMany({
    where: {
      organisationId,
      id: parsed.data.id,
      OR: [{ userId: session.id }, { userId: null }],
    },
    data: { isRead: true },
  });
  return NextResponse.json({ ok: true });
}
