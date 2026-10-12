import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hrApi, fieldErrors, clientIp } from "@/lib/hr-api";
import { writeOrgAudit } from "@/lib/org-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const dateStr = z.string().regex(DATE_RE, "Use a valid date");

const createSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(160),
  category: z.string().trim().min(1).max(60).default("General"),
  content: z.string().trim().min(10, "Content is required").max(40000),
  version: z.string().trim().min(1).max(20).default("1.0"),
  effectiveDate: dateStr,
  reviewDate: dateStr.nullish(),
  isMandatory: z.boolean().default(false),
});

function localDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** GET /api/hr/policies — policy library with acknowledgement counts. */
export async function GET() {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;

  const policies = await prisma.policy.findMany({
    where: { organisationId: auth.ctx.organisationId },
    orderBy: [{ isMandatory: "desc" }, { title: "asc" }],
    include: { _count: { select: { acknowledgements: true } } },
  });

  return NextResponse.json({ policies });
}

/** POST /api/hr/policies — create a policy. */
export async function POST(req: NextRequest) {
  const auth = await hrApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }
  const d = parsed.data;

  const policy = await prisma.policy.create({
    data: {
      organisationId,
      title: d.title.trim(),
      category: d.category,
      content: d.content,
      version: d.version.trim(),
      effectiveDate: localDate(d.effectiveDate),
      reviewDate: d.reviewDate ? localDate(d.reviewDate) : null,
      isMandatory: d.isMandatory,
      createdById: auth.ctx.session.id,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "HR_POLICY_CREATED",
    category: "policies",
    description: `Created policy '${policy.title}' v${policy.version}`,
    entityType: "Policy",
    entityId: policy.id,
    metadata: { category: d.category, isMandatory: d.isMandatory },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, item: policy }, { status: 201 });
}
