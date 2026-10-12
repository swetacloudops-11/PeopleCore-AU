import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi } from "@/lib/org-api";

/** GET /api/org/notifications — latest in-app notifications for the tenant. */
export async function GET() {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const notifications = await prisma.orgNotification.findMany({
    where: { organisationId: auth.ctx.organisationId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ notifications });
}

const patchSchema = z.object({
  action: z.enum(["read_all", "read"]),
  id: z.string().optional(),
});

/** PATCH /api/org/notifications — mark one or all as read. */
export async function PATCH(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const scope = { organisationId: auth.ctx.organisationId };

  if (parsed.data.action === "read_all") {
    await prisma.orgNotification.updateMany({
      where: { ...scope, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (!parsed.data.id) {
    return NextResponse.json({ error: "id is required" }, { status: 422 });
  }

  await prisma.orgNotification.updateMany({
    where: { ...scope, id: parsed.data.id },
    data: { isRead: true },
  });

  return NextResponse.json({ ok: true });
}
