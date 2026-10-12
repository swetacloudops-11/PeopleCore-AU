import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const patchSchema = z.object({
  preferredName: z.string().max(100, "Preferred name is too long").optional(),
  phone: z.string().max(30, "Phone is too long").optional(),
  personalEmail: z
    .union([z.string().email("Enter a valid email address"), z.literal("")])
    .optional(),
  emergencyContactName: z.string().max(120, "Contact name is too long").optional(),
  emergencyContactPhone: z.string().max(30, "Contact phone is too long").optional(),
});

/**
 * PATCH /api/employee/profile — self-service edit of a limited field set on
 * the signed-in person's own Employee row. The id always comes from the
 * session (employeeApi), never from the payload. Honours the organisation
 * switch `hr:allow_self_profile_edit`.
 */
export async function PATCH(req: NextRequest) {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;
  const { organisationId, employeeId, session } = auth.ctx;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  // HR can turn self-service profile editing off for the whole organisation.
  const allowSelfEdit = await prisma.orgSetting.findFirst({
    where: { organisationId, key: "hr:allow_self_profile_edit" },
    select: { value: true },
  });
  if (allowSelfEdit?.value === "false") {
    return NextResponse.json(
      { error: "Self-service profile editing is disabled" },
      { status: 403 }
    );
  }

  // Empty strings clear the field — the DB columns are nullable.
  const clean = (v: string) => {
    const t = v.trim();
    return t === "" ? null : t;
  };

  const d = parsed.data;
  const data: Record<string, string | null> = {};
  if (d.preferredName !== undefined) data.preferredName = clean(d.preferredName);
  if (d.phone !== undefined) data.phone = clean(d.phone);
  if (d.personalEmail !== undefined) data.personalEmail = clean(d.personalEmail);
  if (d.emergencyContactName !== undefined) {
    data.emergencyContactName = clean(d.emergencyContactName);
  }
  if (d.emergencyContactPhone !== undefined) {
    data.emergencyContactPhone = clean(d.emergencyContactPhone);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await prisma.employee.update({ where: { id: employeeId }, data });

  await writeOrgAudit({
    organisationId,
    action: "self.profile.updated",
    category: "self-service",
    description: `${session.name} updated their own profile`,
    entityType: "Employee",
    entityId: employeeId,
    metadata: { fields: Object.keys(data) },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
