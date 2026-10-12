import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi, fieldErrors, clientIp } from "@/lib/org-api";
import { writeOrgAudit } from "@/lib/org-audit";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const createSchema = z.object({
  title: z.string().min(2).max(160),
  category: z.string().min(1).max(60).default("General"),
  content: z.string().min(10).max(40000),
  version: z.string().min(1).max(20).default("1.0"),
  effectiveDate: dateStr,
  reviewDate: dateStr.nullish(),
  isMandatory: z.boolean().default(false),
});

function localDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function invalid(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return NextResponse.json(
    { error: "Please correct the highlighted fields", fields: fieldErrors(issues) },
    { status: 422 }
  );
}

/** POST /api/org/policies — create a policy document. */
export async function POST(req: NextRequest) {
  const auth = await orgApi();
  if (!auth.ok) return auth.response;
  const organisationId = auth.ctx.organisationId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);

  const data = parsed.data;

  const policy = await prisma.policy.create({
    data: {
      organisationId,
      title: data.title.trim(),
      category: data.category,
      content: data.content,
      version: data.version.trim(),
      effectiveDate: localDate(data.effectiveDate),
      reviewDate: data.reviewDate ? localDate(data.reviewDate) : null,
      isMandatory: data.isMandatory,
      createdById: auth.ctx.session.id,
    },
  });

  await writeOrgAudit({
    organisationId,
    action: "POLICY_CREATED",
    category: "policies",
    description: `Created policy '${policy.title}' v${policy.version}`,
    entityType: "Policy",
    entityId: policy.id,
    metadata: { category: data.category, isMandatory: data.isMandatory },
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, id: policy.id }, { status: 201 });
}
