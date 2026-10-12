import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi } from "@/lib/hr-api";

/** GET /api/hr/notifications — latest in-app notifications for the tenant. */
export async function GET() {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;

  const notifications = await prisma.orgNotification.findMany({
    where: { organisationId: auth.ctx.organisationId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ notifications });
}

const patchSchema = z.object({
  action: z.enum(["read", "read_all"]),
  id: z.string().optional(),
});

/** PATCH /api/hr/notifications — mark one or all notifications as read. */
export async function PATCH(req: NextRequest) {
  const auth = await hrApi();
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
    return NextResponse.json(
      { error: "id is required", fields: { id: "Required" } },
      { status: 422 }
    );
  }

  await prisma.orgNotification.updateMany({
    where: { ...scope, id: parsed.data.id },
    data: { isRead: true },
  });

  return NextResponse.json({ ok: true });
}
