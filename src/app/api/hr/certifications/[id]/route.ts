import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const patchSchema = z.object({
  status: z.enum(["CURRENT", "EXPIRING", "EXPIRED", "PENDING"]).optional(),
  issuedDate: z.union([z.string().regex(DATE_RE), z.literal("")]).optional(),
  expiryDate: z.union([z.string().regex(DATE_RE), z.literal("")]).optional(),
  certificateNumber: z.union([z.string().trim().max(200), z.literal("")]).optional(),
  notes: z.union([z.string().trim().max(1000), z.literal("")]).optional(),
});

/** Load an employee certification, scoped through its employee's organisation. */
async function findScoped(id: string, organisationId: string) {
  const row = await prisma.employeeCertification.findFirst({
    where: { id },
    include: {
      employee: { select: { id: true, organisationId: true, firstName: true, lastName: true } },
      certification: { select: { id: true, name: true } },
    },
  });
  if (!row || row.employee.organisationId !== organisationId) return null;
  return row;
}

/** PATCH /api/hr/certifications/[id] — update an employee certification record. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const row = await findScoped(id, organisationId);
  if (!row) {
    return NextResponse.json({ error: "Certification record not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;

  const updated = await prisma.employeeCertification.update({
    where: { id },
    data: {
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.issuedDate !== undefined
        ? { issuedDate: d.issuedDate ? new Date(d.issuedDate) : null }
        : {}),
      ...(d.expiryDate !== undefined
        ? { expiryDate: d.expiryDate ? new Date(d.expiryDate) : null }
        : {}),
      ...(d.certificateNumber !== undefined
        ? { certificateNumber: d.certificateNumber || null }
        : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "hr.certification.assignment.updated",
    category: "people",
    description: `Updated "${row.certification.name}" for ${row.employee.firstName} ${row.employee.lastName}`,
    entityType: "EmployeeCertification",
    entityId: id,
    metadata: { changed: Object.keys(d) },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, item: updated });
}

/** DELETE /api/hr/certifications/[id] — remove an employee certification record. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const row = await findScoped(id, organisationId);
  if (!row) {
    return NextResponse.json({ error: "Certification record not found" }, { status: 404 });
  }

  await prisma.employeeCertification.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "hr.certification.assignment.deleted",
    category: "people",
    severity: "WARNING",
    description: `Removed "${row.certification.name}" from ${row.employee.firstName} ${row.employee.lastName}`,
    entityType: "EmployeeCertification",
    entityId: id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
