import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";

/**
 * POST /api/site/demo — capture a marketing demo request.
 *
 * Persisted as an AuditLog row (action SITE_DEMO_REQUEST) so sales enquiries
 * land in the platform audit trail. writeAudit already swallows database
 * errors, so a database blip never blocks the enquiry from succeeding.
 */
const demoSchema = z.object({
  name: z.string().trim().min(2, "Please tell us your name").max(120),
  email: z.string().trim().email("Enter a valid work email").max(200),
  company: z.union([z.string().trim().max(160), z.literal("")]).optional(),
  teamSize: z.union([z.string().trim().max(40), z.literal("")]).optional(),
  message: z.union([z.string().trim().max(1000), z.literal("")]).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = demoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: "Please check the highlighted fields", fields }, { status: 422 });
  }

  const d = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  await writeAudit({
    action: "SITE_DEMO_REQUEST",
    category: "marketing",
    severity: "INFO",
    description: `Demo request from ${d.name} <${d.email}>${d.company ? ` at ${d.company}` : ""}`,
    entityType: "DemoRequest",
    metadata: {
      name: d.name,
      email: d.email,
      company: d.company || null,
      teamSize: d.teamSize || null,
      message: d.message || null,
      source: "marketing-site",
    },
    ipAddress: ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
