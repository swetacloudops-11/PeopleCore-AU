import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const optDate = z.union([z.string().regex(DATE_RE), z.literal("")]).optional();
const optText = z.union([z.string().trim().max(300), z.literal("")]).optional();

const createSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  title: z.string().trim().min(1, "Title is required"),
  category: z.string().trim().min(1).default("Other"),
  fileName: z.string().trim().min(1, "File name is required"),
  fileType: optText,
  fileSize: z.coerce.number().int().min(0).default(0),
  expiryDate: optDate,
  isConfidential: z.boolean().default(false),
});

/** POST /api/org/documents — record document metadata (synthetic URL, no real storage). */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;
  const organisationId = auth.ctx.organisationId;

  // Cross-tenant safety: the target employee must belong to this org.
  const employee = await prisma.employee.findFirst({
    where: { id: d.employeeId, organisationId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!employee) {
    return NextResponse.json(
      { error: "Invalid references", fields: { employeeId: "Unknown employee" } },
      { status: 422 }
    );
  }

  // No real file storage in this environment — synthesise a stable URL.
  const safeName = d.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const url = `/files/documents/${Date.now()}-${safeName}`;

  const doc = await prisma.employeeDocument.create({
    data: {
      organisationId,
      employeeId: d.employeeId,
      title: d.title,
      category: d.category,
      fileName: d.fileName,
      fileType: d.fileType || null,
      fileSize: d.fileSize,
      url,
      isConfidential: d.isConfidential,
      expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
      uploadedById: auth.ctx.session.id,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "document.uploaded",
    category: "people",
    description: `Recorded document "${doc.title}" for ${employee.firstName} ${employee.lastName}`,
    entityType: "EmployeeDocument",
    entityId: doc.id,
    metadata: { employeeId: d.employeeId, category: doc.category, isConfidential: doc.isConfidential },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
