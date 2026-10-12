import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi, fieldErrors, clientIp } from "@/lib/employee-api";
import { writeOrgAudit } from "@/lib/org-audit";

const PAGE_SIZE = 25;
/** A standard paid day — hours beyond this on an entry count as overtime. */
const STANDARD_DAY_HOURS = 7.6;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date (YYYY-MM-DD)");
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");

const entrySchema = z.object({
  date: dateStr,
  startTime: timeStr.optional(),
  endTime: timeStr.optional(),
  breakMinutes: z.number().int().min(0).max(480),
  hours: z.number().min(0).max(24),
  notes: z.string().max(200).optional(),
});

const createSchema = z.object({
  periodStart: dateStr,
  periodEnd: dateStr,
  entries: z.array(entrySchema).min(1).max(14),
  submit: z.boolean(),
});

const TS_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"] as const;

/** Local-midnight Date from a yyyy-mm-dd string (matches @db.Date seeds). */
function localDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err &&
    (err as { code?: string }).code === "P2002";
}

/** GET /api/employee/timesheets — the signed-in employee's own timesheets, paginated. */
export async function GET(req: NextRequest) {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;
  const { organisationId, employeeId } = auth.ctx;

  const sp = req.nextUrl.searchParams;
  const pageRaw = Number.parseInt(sp.get("page") ?? "1", 10);
  const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
  const status = sp.get("status");
  const validStatus =
    status && (TS_STATUSES as readonly string[]).includes(status) ? status : null;

  const where = {
    organisationId,
    employeeId,
    ...(validStatus ? { status: validStatus as never } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.timesheet.count({ where }),
    prisma.timesheet.findMany({
      where,
      orderBy: { periodStart: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { entries: { orderBy: { date: "asc" } } },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    page,
    pageSize: PAGE_SIZE,
    total,
    items: rows.map((t) => ({
      id: t.id,
      periodStart: t.periodStart.toISOString().slice(0, 10),
      periodEnd: t.periodEnd.toISOString().slice(0, 10),
      totalHours: Number(t.totalHours),
      overtimeHours: Number(t.overtimeHours),
      status: t.status,
      submittedAt: t.submittedAt ? t.submittedAt.toISOString() : null,
      rejectedReason: t.rejectedReason,
      notes: t.notes,
      entryCount: t.entries.length,
      entries: t.entries.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        startTime: e.startTime,
        endTime: e.endTime,
        breakMinutes: e.breakMinutes,
        hours: Number(e.hours),
        notes: e.notes,
      })),
    })),
  });
}

/** POST /api/employee/timesheets — create a weekly timesheet as draft or submitted. */
export async function POST(req: NextRequest) {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;
  const { organisationId, employeeId } = auth.ctx;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted fields", fields: fieldErrors(parsed.error.issues) },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const totalHours = round2(data.entries.reduce((a, e) => a + e.hours, 0));
  const overtimeHours = round2(
    data.entries.reduce((a, e) => a + Math.max(0, e.hours - STANDARD_DAY_HOURS), 0)
  );

  const timesheet = await prisma.timesheet
    .create({
      data: {
        organisationId,
        employeeId,
        periodStart: localDate(data.periodStart),
        periodEnd: localDate(data.periodEnd),
        totalHours,
        overtimeHours,
        status: data.submit ? "SUBMITTED" : "DRAFT",
        submittedAt: data.submit ? new Date() : null,
        entries: {
          createMany: {
            data: data.entries.map((e) => ({
              date: localDate(e.date),
              startTime: e.startTime ?? null,
              endTime: e.endTime ?? null,
              breakMinutes: e.breakMinutes,
              hours: e.hours,
              overtimeHours: round2(Math.max(0, e.hours - STANDARD_DAY_HOURS)),
              notes: e.notes?.trim() || null,
            })),
          },
        },
      },
      select: { id: true, status: true, totalHours: true },
    })
    .catch((err: unknown) => {
      if (isUniqueViolation(err)) return null;
      throw err;
    });

  if (!timesheet) {
    return NextResponse.json(
      { error: "A timesheet for this week already exists" },
      { status: 422 }
    );
  }

  await writeOrgAudit({
    organisationId,
    action: data.submit ? "self.timesheet.submitted" : "self.timesheet.created",
    category: "self-service",
    description: `Timesheet ${data.periodStart} to ${data.periodEnd} (${totalHours}h)${
      data.submit ? " submitted for approval" : " saved as draft"
    } via the self-service portal`,
    entityType: "Timesheet",
    entityId: timesheet.id,
    metadata: { totalHours, overtimeHours, entryCount: data.entries.length, submit: data.submit },
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json(
    { ok: true, id: timesheet.id, status: timesheet.status },
    { status: 201 }
  );
}
