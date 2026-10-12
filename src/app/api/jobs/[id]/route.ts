import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const schema = z.object({ action: z.enum(["RETRY", "CANCEL"]) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  if (parsed.data.action === "RETRY") {
    if (existing.status === "RUNNING") {
      return NextResponse.json(
        { error: "This job is already running" },
        { status: 409 }
      );
    }

    const job = await prisma.job.update({
      where: { id },
      data: {
        status: "QUEUED",
        attempts: existing.attempts + 1,
        error: null,
        result: null,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        queuedAt: new Date(),
      },
    });

    await writeAudit({
      action: "JOB_RETRIED",
      category: "Platform Diagnostics",
      severity: "WARNING",
      description: `Requeued job '${existing.name}' (attempt ${job.attempts})`,
      entityType: "Job",
      entityId: id,
      metadata: { queue: existing.queue, previousStatus: existing.status },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true, job });
  }

  // CANCEL
  if (existing.status === "SUCCEEDED" || existing.status === "CANCELLED") {
    return NextResponse.json(
      { error: `A ${existing.status.toLowerCase()} job cannot be cancelled` },
      { status: 409 }
    );
  }

  const job = await prisma.job.update({
    where: { id },
    data: {
      status: "CANCELLED",
      error: existing.error ?? "Cancelled by operator",
      finishedAt: new Date(),
      durationMs: existing.startedAt ? Date.now() - existing.startedAt.getTime() : null,
    },
  });

  await writeAudit({
    action: "JOB_CANCELLED",
    category: "Platform Diagnostics",
    severity: "WARNING",
    description: `Cancelled job '${existing.name}' (was ${existing.status})`,
    entityType: "Job",
    entityId: id,
    metadata: { queue: existing.queue, previousStatus: existing.status },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, job });
}
