import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const optText = z.union([z.string().trim().max(300), z.literal("")]).optional();

const patchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  fileName: z.string().trim().min(1).optional(),
  fileType: optText,
  fileSize: z.coerce.number().int().min(0).optional(),
  url: optText,
  expiryDate: z.union([z.string().regex(DATE_RE), z.literal("")]).optional(),
  isConfidential: z.boolean().optional(),
});

/** PATCH /api/hr/documents/[id] — update document metadata. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  // Cross-tenant safety: must belong to this organisation.
  const row = await prisma.employeeDocument.findFirst({
    where: { id, organisationId },
    select: { id: true, title: true },
  });
  if (!row) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;

  const updated = await prisma.employeeDocument.update({
    where: { id },
    data: {
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.fileName !== undefined ? { fileName: d.fileName } : {}),
      ...(d.fileType !== undefined ? { fileType: d.fileType || null } : {}),
      ...(d.fileSize !== undefined ? { fileSize: d.fileSize } : {}),
      ...(d.url !== undefined ? { url: d.url || null } : {}),
      ...(d.expiryDate !== undefined
        ? { expiryDate: d.expiryDate ? new Date(d.expiryDate) : null }
        : {}),
      ...(d.isConfidential !== undefined ? { isConfidential: d.isConfidential } : {}),
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "hr.document.updated",
    category: "people",
    description: `Updated document "${updated.title}"`,
    entityType: "EmployeeDocument",
    entityId: id,
    metadata: { changed: Object.keys(d) },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, item: updated });
}

/** DELETE /api/hr/documents/[id] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const organisationId = auth.ctx.organisationId;

  const row = await prisma.employeeDocument.findFirst({
    where: { id, organisationId },
    select: { id: true, title: true },
  });
  if (!row) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await prisma.employeeDocument.delete({ where: { id } });

  await writeOrgAudit({
    organisationId,
    action: "hr.document.deleted",
    category: "people",
    severity: "WARNING",
    description: `Deleted document "${row.title}"`,
    entityType: "EmployeeDocument",
    entityId: id,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
