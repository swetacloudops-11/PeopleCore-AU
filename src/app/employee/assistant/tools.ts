import "server-only";
import { prisma } from "@/lib/prisma";
import { aiStatus, runAiToolLoop, type AiChatMessage, type AiTool } from "@/lib/ai/llm";
import { formatDate } from "@/lib/format";
import type { AssistantReply } from "./assistant-engine";

/** Context resolved from the server session — never from the model. */
export type EmployeeAiContext = {
  employeeId: string;
  userId: string;
  organisationId: string;
  orgName: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
};

const num = (v: unknown) => Number(v ?? 0);
const clampLimit = (v: unknown, fallback: number, max = 20) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.floor(n)) : fallback;
};
const D = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const emptySchema: Record<string, unknown> = { type: "object", properties: {} };
const limitSchema = {
  type: "object",
  properties: { limit: { type: "number", description: "Max rows to return (1-20)" } },
};

/**
 * Tools the model may call. Every query is pinned to the signed-in employee —
 * the context closes over the server session and never comes from the model.
 */
function makeTools(ctx: EmployeeAiContext): AiTool[] {
  return [
    {
      name: "get_my_profile",
      description:
        "The signed-in employee's own profile: role, department, manager, contact info, pay setup.",
      parameters: emptySchema,
      execute: async () => {
        const e = await prisma.employee.findFirst({
          where: { id: ctx.employeeId },
          select: {
            firstName: true, lastName: true, preferredName: true, employeeNumber: true,
            workEmail: true, personalEmail: true, phone: true, employmentStatus: true,
            employmentType: true, hireDate: true, salaryType: true, baseSalary: true,
            hourlyRate: true, standardHoursPerWeek: true, superFundName: true,
            emergencyContactName: true,
            position: { select: { title: true } },
            department: { select: { name: true } },
            team: { select: { name: true } },
            location: { select: { name: true } },
            manager: { select: { firstName: true, lastName: true } },
          },
        });
        if (!e) return { error: "Profile not found" };
        return {
          name: `${e.firstName} ${e.lastName}`,
          employeeNumber: e.employeeNumber,
          position: e.position?.title ?? null,
          department: e.department?.name ?? null,
          team: e.team?.name ?? null,
          location: e.location?.name ?? null,
          manager: e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : null,
          status: e.employmentStatus,
          employmentType: e.employmentType,
          startedOn: formatDate(e.hireDate),
          pay:
            e.salaryType === "ANNUAL"
              ? `${money(num(e.baseSalary))} per year`
              : `${money(num(e.hourlyRate))} per hour`,
          standardHoursPerWeek: num(e.standardHoursPerWeek),
          superFund: e.superFundName,
        };
      },
    },
    {
      name: "get_my_shifts",
      description:
        "The employee's rostered shifts. Use scope 'upcoming' for future shifts or 'recent' for past ones.",
      parameters: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["upcoming", "recent"] },
          limit: { type: "number", description: "Max rows (1-20)" },
        },
      },
      execute: async (args) => {
        const scope = args["scope"] === "recent" ? "recent" : "upcoming";
        const limit = clampLimit(args["limit"], 8);
        const shifts = await prisma.shift.findMany({
          where: {
            employeeId: ctx.employeeId,
            ...(scope === "upcoming"
              ? { date: { gte: D(0) }, status: { not: "CANCELLED" as never } }
              : { date: { lt: D(0) } }),
          },
          orderBy: [{ date: scope === "upcoming" ? "asc" : "desc" }, { startTime: "asc" }],
          take: limit,
          include: { location: { select: { name: true } }, roster: { select: { name: true } } },
        });
        return {
          count: shifts.length,
          shifts: shifts.map((s) => ({
            date: formatDate(s.date),
            time: `${s.startTime}-${s.endTime}`,
            hours: num(s.hours),
            location: s.location?.name ?? null,
            roster: s.roster.name,
            status: s.status,
          })),
        };
      },
    },
    {
      name: "get_my_attendance",
      description:
        "Clock in/out status for today plus an attendance summary (days worked, hours) for recent days.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "Summary window in days (default 14, max 90)" } },
      },
      execute: async (args) => {
        const days = clampLimit(args["days"], 14, 90);
        const [today, recent, agg] = await Promise.all([
          prisma.attendanceRecord.findFirst({ where: { employeeId: ctx.employeeId, date: D(0) } }),
          prisma.attendanceRecord.findMany({
            where: { employeeId: ctx.employeeId, date: { gte: D(-days + 1) } },
            orderBy: { date: "desc" },
            take: 10,
          }),
          prisma.attendanceRecord.aggregate({
            where: { employeeId: ctx.employeeId, date: { gte: D(-days + 1) } },
            _sum: { workedMinutes: true, overtimeMinutes: true },
            _count: true,
          }),
        ]);
        return {
          today: today
            ? {
                status: today.status,
                clockIn: today.clockIn?.toISOString().slice(11, 16) ?? null,
                clockOut: today.clockOut?.toISOString().slice(11, 16) ?? null,
                workedHours: Math.round((today.workedMinutes / 60) * 10) / 10,
              }
            : null,
          summary: {
            windowDays: days,
            records: agg._count,
            hoursWorked: Math.round((num(agg._sum.workedMinutes) / 60) * 10) / 10,
            overtimeHours: Math.round((num(agg._sum.overtimeMinutes) / 60) * 10) / 10,
          },
          recentDays: recent.map((r) => ({
            date: formatDate(r.date),
            status: r.status,
            workedHours: Math.round((r.workedMinutes / 60) * 10) / 10,
          })),
        };
      },
    },
    {
      name: "get_my_timesheets",
      description:
        "The employee's timesheets and their statuses (DRAFT, SUBMITTED, APPROVED, REJECTED, PAID).",
      parameters: limitSchema,
      execute: async (args) => {
        const limit = clampLimit(args["limit"], 6);
        const [byStatus, rows] = await Promise.all([
          prisma.timesheet.groupBy({ by: ["status"], where: { employeeId: ctx.employeeId }, _count: true }),
          prisma.timesheet.findMany({
            where: { employeeId: ctx.employeeId },
            orderBy: { periodStart: "desc" },
            take: limit,
            select: { periodStart: true, periodEnd: true, totalHours: true, overtimeHours: true, status: true },
          }),
        ]);
        const counts: Record<string, number> = {};
        byStatus.forEach((b) => (counts[b.status] = b._count));
        return {
          counts,
          timesheets: rows.map((t) => ({
            week: `${formatDate(t.periodStart)} to ${formatDate(t.periodEnd)}`,
            totalHours: num(t.totalHours),
            overtimeHours: num(t.overtimeHours),
            status: t.status,
          })),
        };
      },
    },
    {
      name: "get_my_leave_balance",
      description: "Leave entitlements, taken, pending and remaining days per leave type for the current year.",
      parameters: emptySchema,
      execute: async () => {
        const year = new Date().getFullYear();
        const balances = await prisma.leaveBalance.findMany({
          where: { employeeId: ctx.employeeId, year },
          include: { leaveType: { select: { name: true } } },
        });
        return {
          year,
          balances: balances.map((b) => {
            const entitled = num(b.entitlement) + num(b.carriedOver);
            return {
              leaveType: b.leaveType.name,
              entitled,
              taken: num(b.taken),
              pending: num(b.pending),
              remaining: Math.max(0, entitled - num(b.taken) - num(b.pending)),
            };
          }),
        };
      },
    },
    {
      name: "get_my_leave_requests",
      description: "The employee's leave requests with status and manager review notes.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] },
          limit: { type: "number", description: "Max rows (1-20)" },
        },
      },
      execute: async (args) => {
        const status = typeof args["status"] === "string" ? args["status"] : null;
        const limit = clampLimit(args["limit"], 8);
        const rows = await prisma.leaveRequest.findMany({
          where: { employeeId: ctx.employeeId, ...(status ? { status: status as never } : {}) },
          orderBy: { appliedAt: "desc" },
          take: limit,
          include: { leaveType: { select: { name: true } } },
        });
        return {
          count: rows.length,
          requests: rows.map((l) => ({
            type: l.leaveType.name,
            from: formatDate(l.startDate),
            to: formatDate(l.endDate),
            days: num(l.days),
            status: l.status,
            reviewNotes: l.reviewNotes,
          })),
        };
      },
    },
    {
      name: "get_my_payslips",
      description: "The employee's payslips (gross, tax, super, net) and year-to-date totals.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Max rows (1-12)" } },
      },
      execute: async (args) => {
        const limit = clampLimit(args["limit"], 4, 12);
        const year = new Date().getFullYear();
        const [rows, ytd] = await Promise.all([
          prisma.payslip.findMany({
            where: { employeeId: ctx.employeeId },
            orderBy: { periodEnd: "desc" },
            take: limit,
            include: { payRun: { select: { label: true } } },
          }),
          prisma.payslip.aggregate({
            where: { employeeId: ctx.employeeId, periodEnd: { gte: new Date(`${year}-01-01`) } },
            _sum: { grossPay: true, netPay: true, taxAmount: true, superAmount: true },
            _count: true,
          }),
        ]);
        return {
          payslips: rows.map((p) => ({
            payRun: p.payRun.label,
            period: `${formatDate(p.periodStart)} to ${formatDate(p.periodEnd)}`,
            gross: money(num(p.grossPay)),
            tax: money(num(p.taxAmount)),
            super: money(num(p.superAmount)),
            net: money(num(p.netPay)),
            status: p.status,
          })),
          yearToDate: {
            year,
            payslips: ytd._count,
            gross: money(num(ytd._sum.grossPay)),
            net: money(num(ytd._sum.netPay)),
          },
        };
      },
    },
    {
      name: "get_my_expenses",
      description: "The employee's expense claims and their statuses.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "REIMBURSED"] },
          limit: { type: "number", description: "Max rows (1-20)" },
        },
      },
      execute: async (args) => {
        const status = typeof args["status"] === "string" ? args["status"] : null;
        const limit = clampLimit(args["limit"], 8);
        const rows = await prisma.expense.findMany({
          where: { employeeId: ctx.employeeId, ...(status ? { status: status as never } : {}) },
          orderBy: { expenseDate: "desc" },
          take: limit,
          select: { category: true, description: true, amount: true, status: true, expenseDate: true },
        });
        return {
          count: rows.length,
          claims: rows.map((e) => ({
            date: formatDate(e.expenseDate),
            category: e.category,
            description: e.description,
            amount: money(num(e.amount)),
            status: e.status,
          })),
        };
      },
    },
    {
      name: "get_my_documents",
      description: "Documents on the employee's own file, including any expiring within 60 days.",
      parameters: limitSchema,
      execute: async (args) => {
        const limit = clampLimit(args["limit"], 10);
        const [rows, expiring] = await Promise.all([
          prisma.employeeDocument.findMany({
            where: { employeeId: ctx.employeeId },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { title: true, category: true, expiryDate: true, createdAt: true },
          }),
          prisma.employeeDocument.count({
            where: { employeeId: ctx.employeeId, expiryDate: { not: null, lte: D(60) } },
          }),
        ]);
        return {
          expiringWithin60Days: expiring,
          documents: rows.map((d) => ({
            title: d.title,
            category: d.category,
            expires: d.expiryDate ? formatDate(d.expiryDate) : null,
            uploaded: formatDate(d.createdAt),
          })),
        };
      },
    },
    {
      name: "get_my_policies",
      description: "Company policies and the employee's acknowledgement status for each.",
      parameters: emptySchema,
      execute: async () => {
        const acks = await prisma.policyAcknowledgement.findMany({
          where: { employeeId: ctx.employeeId },
          include: { policy: { select: { title: true, category: true, version: true } } },
          orderBy: { createdAt: "asc" },
        });
        return {
          acknowledgements: acks.map((a) => ({
            policy: a.policy.title,
            category: a.policy.category,
            version: a.policy.version,
            status: a.status,
            dueDate: a.dueDate ? formatDate(a.dueDate) : null,
            acknowledgedAt: a.acknowledgedAt ? formatDate(a.acknowledgedAt) : null,
          })),
        };
      },
    },
    {
      name: "get_my_tasks",
      description:
        "The employee's onboarding/offboarding tasks. Use status 'open' for outstanding or 'completed' for done.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["open", "completed"] },
          limit: { type: "number", description: "Max rows (1-20)" },
        },
      },
      execute: async (args) => {
        const mode = args["status"] === "completed" ? "completed" : "open";
        const limit = clampLimit(args["limit"], 8);
        const where = {
          employeeId: ctx.employeeId,
          ...(mode === "completed"
            ? { status: { in: ["COMPLETED", "WAIVED"] as never } }
            : { status: { in: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] as never } }),
        };
        const [rows, overdue] = await Promise.all([
          prisma.onboardingTask.findMany({
            where,
            orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
            take: limit,
            select: { title: true, stage: true, category: true, status: true, dueDate: true },
          }),
          prisma.onboardingTask.count({
            where: {
              employeeId: ctx.employeeId,
              status: { in: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] },
              dueDate: { lt: D(0) },
            },
          }),
        ]);
        return {
          overdueCount: overdue,
          tasks: rows.map((t) => ({
            title: t.title,
            stage: t.stage,
            category: t.category,
            status: t.status,
            due: t.dueDate ? formatDate(t.dueDate) : null,
          })),
        };
      },
    },
    {
      name: "get_my_notifications",
      description: "The employee's notifications (targeted to them plus company-wide announcements).",
      parameters: limitSchema,
      execute: async (args) => {
        const limit = clampLimit(args["limit"], 8);
        const rows = await prisma.orgNotification.findMany({
          where: { organisationId: ctx.organisationId, OR: [{ userId: ctx.userId }, { userId: null }] },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { title: true, body: true, isRead: true, createdAt: true, linkUrl: true },
        });
        return {
          unread: rows.filter((r) => !r.isRead).length,
          notifications: rows.map((n) => ({
            title: n.title,
            body: n.body,
            read: n.isRead,
            when: formatDate(n.createdAt),
            link: n.linkUrl,
          })),
        };
      },
    },
    {
      name: "get_my_availability",
      description: "The employee's weekly availability (per day: available or not, start/end times).",
      parameters: emptySchema,
      execute: async () => {
        const rows = await prisma.availability.findMany({
          where: { employeeId: ctx.employeeId },
          orderBy: { dayOfWeek: "asc" },
        });
        const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        return {
          availability: rows.map((a) => ({
            day: names[a.dayOfWeek] ?? String(a.dayOfWeek),
            available: a.isAvailable,
            startTime: a.startTime,
            endTime: a.endTime,
            note: a.note,
          })),
        };
      },
    },
  ];
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function buildSystemPrompt(ctx: EmployeeAiContext): string {
  const now = new Date();
  return `You are the PeopleCore Employee Portal assistant for ${ctx.firstName} ${ctx.lastName} (${ctx.employeeNumber}) at ${ctx.orgName}.

Current date: ${DAY_NAMES[now.getDay()]}, ${formatDate(now)}.

RULES
- You answer ONLY for this one person, using the tools provided. Never invent numbers, dates or names.
- Never reveal or compute organisation-wide statistics or any other employee's data — you don't have tools for that, and must refuse such questions politely.
- If a tool returns empty data, say so plainly instead of guessing.
- Mirror the user's language: reply in English, or Hinglish if they write in Hinglish.
- Keep answers short (2-5 sentences). Use a compact bullet list when comparing several items. No markdown tables.
- For "how do I / where do I" questions, answer from the PORTAL GUIDE and always give the exact route path in parentheses, e.g. (/employee/leave/new).
- Amounts are AUD. Times are 24h. Dates are Australian format (DD Mon YYYY).

PORTAL GUIDE
- Dashboard: /employee/dashboard
- My Profile: /employee/profile (sections: #personal, #contact, #employment, #emergency); update at /employee/profile/edit (limited fields; employment/pay data is managed by HR)
- My Roster: schedule /employee/roster, upcoming /employee/roster/upcoming, shift details /employee/shifts/[id], request a swap /employee/roster/swaps, weekly availability /employee/availability
- Time & Attendance: clock in/out /employee/attendance, history /employee/attendance/history, timesheets /employee/timesheets, submit /employee/timesheets/new
- Leave: apply /employee/leave/new, my requests /employee/leave, status /employee/leave/status, balance /employee/leave/balance, history /employee/leave/history
- Payroll: /employee/payslips, history /employee/payroll/history, payment details /employee/payroll/details (bank/super changes go through HR)
- Expenses: submit /employee/expenses/new, claims /employee/expenses, status /employee/expenses/status (pending claims can be withdrawn)
- Documents: /employee/documents, upload /employee/documents/upload
- Policies: /employee/policies, acknowledge at /employee/policies/acknowledgements
- Onboarding: /employee/onboarding, required documents /employee/onboarding/documents, checklist status /employee/onboarding/checklist
- Tasks: /employee/tasks, completed /employee/tasks/completed, details /employee/tasks/[id]
- Notifications: /employee/notifications (+ /shifts, /leave, /announcements)
- Settings: /employee/settings, change password /employee/settings/password, notification preferences /employee/settings/notifications`;
}

/**
 * Try to answer with the live LLM (tool-calling). Returns null when no AI
 * provider is configured or the call fails — the caller then falls back to
 * the built-in deterministic engine.
 */
export async function answerWithAI(
  ctx: EmployeeAiContext,
  question: string,
  history: AiChatMessage[] = []
): Promise<AssistantReply | null> {
  const status = aiStatus();
  if (!status.enabled) return null;

  const text = await runAiToolLoop({
    system: buildSystemPrompt(ctx),
    messages: [...history.slice(-6), { role: "user", content: question }],
    tools: makeTools(ctx),
  });
  if (!text) return null;

  return { intent: "ai", answer: text, table: null };
}
