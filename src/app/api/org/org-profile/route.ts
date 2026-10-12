import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  name: z.string().min(2, "Name is too short").max(120).optional(),
  abn: z.string().max(20).nullish(),
  email: z.union([z.string().email("Enter a valid email"), z.literal("")]).nullish(),
  phone: z.string().max(30).nullish(),
  addressLine1: z.string().max(160).nullish(),
  city: z.string().max(80).nullish(),
  state: z.string().max(40).nullish(),
  postcode: z.string().max(10).nullish(),
  industry: z.string().max(80).nullish(),
});

/**
 * PATCH /api/org/org-profile — edit the signed-in organisation's own row.
 * The id always comes from the session, never from the payload.
 */
export async function PATCH(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const organisationId = auth.ctx.organisationId;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const existing = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { name: true, slug: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  const clean = (v: string | null | undefined) => (v == null || v === "" ? null : v.trim());

  const data: Record<string, string | null> = {};
  const d = parsed.data;
  if (d.name !== undefined) data.name = d.name.trim();
  if (d.abn !== undefined) data.abn = clean(d.abn);
  if (d.email !== undefined) data.email = clean(d.email);
  if (d.phone !== undefined) data.phone = clean(d.phone);
  if (d.addressLine1 !== undefined) data.addressLine1 = clean(d.addressLine1);
  if (d.city !== undefined) data.city = clean(d.city);
  if (d.state !== undefined) data.state = clean(d.state);
  if (d.postcode !== undefined) data.postcode = clean(d.postcode);
  if (d.industry !== undefined) data.industry = clean(d.industry);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const updated = await prisma.organisation.update({
    where: { id: organisationId },
    data,
    select: {
      id: true, name: true, slug: true, abn: true, email: true, phone: true,
      addressLine1: true, city: true, state: true, postcode: true, industry: true,
      status: true, employeeCount: true, createdAt: true,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "ORG_PROFILE_UPDATED",
    category: "Organisation Settings",
    severity: "INFO",
    description: `Updated organisation profile for '${updated.name}'`,
    entityType: "Organisation",
    entityId: organisationId,
    metadata: { fields: Object.keys(data) },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, org: updated });
}
