import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const catalogueSchema = z.object({
  name: z.string().trim().min(1).optional(),
  issuingBody: z.union([z.string().trim().max(300), z.literal("")]).optional(),
  description: z.union([z.string().trim().max(1000), z.literal("")]).optional(),
  validityMonths: z.coerce.number().int().min(1).max(120).nullable().optional(),
  isMandatory: z.boolean().optional(),
});

const assignmentSchema = z.object({
  status: z.enum(["CURRENT", "EXPIRING", "EXPIRED", "PENDING"]).optional(),
  issuedDate: z.union([z.string().regex(DATE_RE), z.literal("")]).optional(),
  expiryDate: z.union([z.string().regex(DATE_RE), z.literal("")]).optional(),
  certificateNumber: z.union([z.string().trim().max(200), z.literal("")]).optional(),
  notes: z.union([z.string().trim().max(1000), z.literal("")]).optional(),
});

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** PATCH /api/org/certifications/[id]?type=assignment — update catalogue entry or an employee's certification. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const organisationId = auth.ctx.organisationId;
  const isAssignment =
    new URL(req.url).searchParams.get("type") === "assignment";

  if (!isAssignment) {
    const row = await prisma.certification.findFirst({
      where: { id, organisationId },
      select: { id: true, name: true },
    });
    if (!row) return NextResponse.json({ error: "Certification not found" }, { status: 404 });

    const parsed = catalogueSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
        { status: 422 }
      );
    }
    const d = parsed.data;

    try {
      const updated = await prisma.certification.update({
        where: { id },
        data: {
          ...(d.name !== undefined ? { name: d.name } : {}),
          ...(d.issuingBody !== undefined ? { issuingBody: d.issuingBody || null } : {}),
          ...(d.description !== undefined ? { description: d.description || null } : {}),
          ...(d.validityMonths !== undefined ? { validityMonths: d.validityMonths } : {}),
          ...(d.isMandatory !== undefined ? { isMandatory: d.isMandatory } : {}),
        },
      });

      await writeOrgAudit({
        organisationId,
        action: "certification.updated",
        category: "people",
        description: `Updated certification "${updated.name}"`,
        entityType: "Certification",
        entityId: id,
        ipAddress: clientIp(req),
        userAgent: req.headers.get("user-agent") ?? undefined,
      });

      return NextResponse.json({ certification: updated });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json(
          { error: "A certification with this name already exists", fields: { name: "Already in use" } },
          { status: 422 }
        );
      }
      throw err;
    }
  }

  // Assignment: verify the linked employee belongs to this organisation.
  const row = await prisma.employeeCertification.findFirst({
    where: { id },
    include: {
      employee: { select: { id: true, organisationId: true, firstName: true, lastName: true } },
      certification: { select: { id: true, name: true } },
    },
  });
  if (!row || row.employee.organisationId !== organisationId) {
    return NextResponse.json({ error: "Certification assignment not found" }, { status: 404 });
  }

  const parsed = assignmentSchema.safeParse(await req.json().catch(() => null));
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
    action: "certification.assignment.updated",
    category: "people",
    description: `Updated "${row.certification.name}" for ${row.employee.firstName} ${row.employee.lastName}`,
    entityType: "EmployeeCertification",
    entityId: id,
    metadata: { changed: Object.keys(d) },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ assignment: updated });
}

/** DELETE /api/org/certifications/[id]?type=assignment */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const organisationId = auth.ctx.organisationId;
  const isAssignment =
    new URL(req.url).searchParams.get("type") === "assignment";

  if (!isAssignment) {
    const row = await prisma.certification.findFirst({
      where: { id, organisationId },
      select: { id: true, name: true },
    });
    if (!row) return NextResponse.json({ error: "Certification not found" }, { status: 404 });

    await prisma.certification.delete({ where: { id } });

    await writeOrgAudit({
      organisationId,
      action: "certification.deleted",
      category: "people",
      severity: "WARNING",
      description: `Deleted certification "${row.name}"`,
      entityType: "Certification",
      entityId: id,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  }

  const row = await prisma.employeeCertification.findFirst({
    where: { id },
    include: {
      employee: { select: { organisationId: true, firstName: true, lastName: true } },
      certification: { select: { name: true } },
    },
  });
  if (!row || row.employee.organisationId !== organisationId) {
    return NextResponse.json({ error: "Certification assignment not found" }, { status: 404 });
  }

  await prisma.employeeCertification.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "certification.assignment.deleted",
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
