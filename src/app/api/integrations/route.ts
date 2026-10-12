import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  key: z.string().min(2).max(60),
  name: z.string().min(2).max(80),
  provider: z.string().min(2).max(80),
  category: z.enum(["ACCOUNTING", "BANKING", "PAYROLL", "HRIS", "IDENTITY", "CUSTOM"]),
  description: z.string().max(400).nullish(),
  websiteUrl: z.string().url().nullish().or(z.literal("").transform(() => null)),
  docsUrl: z.string().url().nullish().or(z.literal("").transform(() => null)),
  isOfficial: z.boolean().default(false),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).default("ACTIVE"),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const key = data.key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const clash = await prisma.integration.findUnique({ where: { key } });
  if (clash) {
    return NextResponse.json(
      { error: "An integration with that key already exists", fields: { key: "Already in use" } },
      { status: 409 }
    );
  }

  const maxSort = await prisma.integration.aggregate({ _max: { sortOrder: true } });
  const integration = await prisma.integration.create({
    data: { ...data, key, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
  });

  await writeAudit({
    action: "INTEGRATION_CREATED",
    category: "Integrations",
    severity: "INFO",
    description: `Registered integration '${integration.name}' (${key})`,
    entityType: "Integration",
    entityId: integration.id,
    metadata: { key, category: data.category },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, id: integration.id }, { status: 201 });
}
