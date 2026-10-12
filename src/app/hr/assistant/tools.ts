import "server-only";
import { prisma } from "@/lib/prisma";
import { aiStatus, runAiToolLoop, type AiChatMessage, type AiTool } from "@/lib/ai/llm";
import { formatDate } from "@/lib/format";
import type { AssistantReply } from "./assistant-engine";

export type HrAiContext = { organisationId: string; orgName: string; firstName: string };

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

const emptySchema: Record<string, unknown> = { type: "object", properties: {} };
const limitSchema = {
  type: "object",
  properties: { limit: { type: "number", description: "Max rows to return (1-20)" } },
};

/** Tools for the HR console — org-wide people data, scoped to the tenant. */
function makeTools(ctx: HrAiContext): AiTool[] {
  const org = ctx.organisationId;
  return [
    {
      name: "get_headcount",
      description: "Organisation headcount: totals and breakdowns by employment status, type and department.",
      parameters: emptySchema,
      execute: async () => {
        const [total, byStatus, byType, byDept, departments] = await Promise.all([
          prisma.employee.count({ where: { organisationId: org } }),
          prisma.employee.groupBy({ by: ["employmentStatus"], where: { organisationId: org }, _count: true }),
          prisma.employee.groupBy({ by: ["employmentType"], where: { organisationId: org }, _count: true }),
          prisma.employee.groupBy({ by: ["departmentId"], where: { organisationId: org, departmentId: { not: null } }, _count: true }),
          prisma.department.findMany({ where: { organisationId: org }, select: { id: true, name: true } }),
        ]);
        const nameOf = (id: string | null) =>
          id === null ? "Unassigned" : departments.find((d) => d.id === id)?.name ?? "Unknown";
        return {
          total,
          byStatus: byStatus.map((s) => ({ status: s.employmentStatus, count: s._count })),
          byType: byType.map((t) => ({ type: t.employmentType, count: t._count })),
          byDepartment: byDept.map((d) => ({ department: nameOf(d.departmentId), count: d._count })),
        };
      },
    },
    {
      name: "get_new_starters",
      description: "Employees hired recently (default last 45 days) with their roles and start dates.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "Look-back window in days (default 45, max 365)" } },
      },
      execute: async (args) => {
        const days = clampLimit(args["days"], 45, 365);
        const rows = await prisma.employee.findMany({
          where: { organisationId: org, hireDate: { gte: D(-days) } },
          orderBy: { hireDate: "desc" },
          take: 15,
          select: {
            firstName: true, lastName: true, hireDate: true, employmentStatus: true,
            position: { select: { title: true } },
          },
        });
        return {
          windowDays: days,
          count: rows.length,
          starters: rows.map((e) => ({
            name: `${e.firstName} ${e.lastName}`,
            role: e.position?.title ?? null,
            started: formatDate(e.hireDate),
            status: e.employmentStatus,
          })),
        };
      },
    },
    {
      name: "get_upcoming_exits",
      description: "Employees with a future termination date plus the number of departures in the last 90 days.",
      parameters: emptySchema,
      execute: async () => {
        const [upcoming, recent] = await Promise.all([
          prisma.employee.findMany({
            where: { organisationId: org, terminationDate: { gte: D(0) } },
            orderBy: { terminationDate: "asc" },
            take: 10,
            select: { firstName: true, lastName: true, terminationDate: true, terminationReason: true },
          }),
          prisma.employee.count({ where: { organisationId: org, terminationDate: { gte: D(-90) } } }),
        ]);
        return {
          exitsLast90Days: recent,
          upcoming: upcoming.map((e) => ({
            name: `${e.firstName} ${e.lastName}`,
            lastDay: e.terminationDate ? formatDate(e.terminationDate) : null,
            reason: e.terminationReason,
          })),
        };
      },
    },
    {
      name: "get_pending_leave",
      description: "Leave requests awaiting HR approval, with employee names, types and dates.",
      parameters: limitSchema,
      execute: async (args) => {
        const limit = clampLimit(args["limit"], 10);
        const rows = await prisma.leaveRequest.findMany({
          where: { organisationId: org, status: "PENDING" },
          orderBy: { appliedAt: "asc" },
          take: limit,
          include: {
            employee: { select: { firstName: true, lastName: true } },
            leaveType: { select: { name: true } },
          },
        });
        const total = await prisma.leaveRequest.count({ where: { organisationId: org, status: "PENDING" } });
        return {
          totalPending: total,
          requests: rows.map((l) => ({
            employee: `${l.employee.firstName} ${l.employee.lastName}`,
            type: l.leaveType.name,
            from: formatDate(l.startDate),
            to: formatDate(l.endDate),
            days: num(l.days),
            applied: formatDate(l.appliedAt),
          })),
        };
      },
    },
    {
      name: "get_leave_liability",
      description: "Organisation leave liability: entitled, taken, pending and remaining days per leave type this year.",
      parameters: emptySchema,
      execute: async () => {
        const year = new Date().getFullYear();
        const balances = await prisma.leaveBalance.groupBy({
          by: ["leaveTypeId"],
          where: { organisationId: org, year },
          _sum: { entitlement: true, taken: true, pending: true, carriedOver: true },
        });
        const types = await prisma.leaveType.findMany({ where: { organisationId: org }, select: { id: true, name: true } });
        return {
          year,
          byType: balances.map((b) => {
            const entitled = num(b._sum.entitlement) + num(b._sum.carriedOver);
            return {
              leaveType: types.find((t) => t.id === b.leaveTypeId)?.name ?? "Unknown",
              entitled,
              taken: num(b._sum.taken),
              pending: num(b._sum.pending),
              remaining: Math.max(0, entitled - num(b._sum.taken) - num(b._sum.pending)),
            };
          }),
        };
      },
    },
    {
      name: "get_onboarding_tasks",
      description: "Onboarding/offboarding tasks: status counts, overdue count and the next tasks due.",
      parameters: {
        type: "object",
        properties: {
          stage: { type: "string", enum: ["ONBOARDING", "OFFBOARDING"] },
          limit: { type: "number", description: "Max rows (1-20)" },
        },
      },
      execute: async (args) => {
        const stage = args["stage"] === "OFFBOARDING" ? "OFFBOARDING" : "ONBOARDING";
        const limit = clampLimit(args["limit"], 8);
        const where = { organisationId: org, stage: stage as never };
        const [byStatus, dueSoon, overdue] = await Promise.all([
          prisma.onboardingTask.groupBy({ by: ["status"], where, _count: true }),
          prisma.onboardingTask.findMany({
            where: { ...where, status: { in: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] as never } },
            orderBy: { dueDate: "asc" },
            take: limit,
            include: { employee: { select: { firstName: true, lastName: true } } },
          }),
          prisma.onboardingTask.count({
            where: { ...where, status: { in: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] as never }, dueDate: { lt: D(0) } },
          }),
        ]);
        return {
          stage,
          byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
          overdue,
          tasks: dueSoon.map((t) => ({
            title: t.title,
            employee: t.employee ? `${t.employee.firstName} ${t.employee.lastName}` : "Unassigned",
            due: t.dueDate ? formatDate(t.dueDate) : null,
            status: t.status,
          })),
        };
      },
    },
    {
      name: "get_certifications",
      description: "Certification compliance: counts by status and the most urgent expiring/expired records.",
      parameters: limitSchema,
      execute: async (args) => {
        const limit = clampLimit(args["limit"], 8);
        const [byStatus, expiring] = await Promise.all([
          prisma.employeeCertification.groupBy({ by: ["status"], where: { employee: { organisationId: org } }, _count: true }),
          prisma.employeeCertification.findMany({
            where: { employee: { organisationId: org }, status: { in: ["EXPIRING", "EXPIRED"] } },
            orderBy: { expiryDate: "asc" },
            take: limit,
            include: {
              employee: { select: { firstName: true, lastName: true } },
              certification: { select: { name: true } },
            },
          }),
        ]);
        return {
          byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
          urgent: expiring.map((c) => ({
            employee: `${c.employee.firstName} ${c.employee.lastName}`,
            certification: c.certification.name,
            expires: c.expiryDate ? formatDate(c.expiryDate) : null,
            status: c.status,
          })),
        };
      },
    },
    {
      name: "get_documents",
      description: "Employee document register: totals, categories and documents expiring within 60 days.",
      parameters: emptySchema,
      execute: async () => {
        const [total, byCategory, expiring] = await Promise.all([
          prisma.employeeDocument.count({ where: { organisationId: org } }),
          prisma.employeeDocument.groupBy({ by: ["category"], where: { organisationId: org }, _count: true }),
          prisma.employeeDocument.findMany({
            where: { organisationId: org, expiryDate: { not: null, lte: D(60) } },
            orderBy: { expiryDate: "asc" },
            take: 8,
            include: { employee: { select: { firstName: true, lastName: true } } },
          }),
        ]);
        return {
          total,
          byCategory: byCategory.map((c) => ({ category: c.category, count: c._count })),
          expiringWithin60Days: expiring.map((d) => ({
            employee: `${d.employee.firstName} ${d.employee.lastName}`,
            title: d.title,
            expires: d.expiryDate ? formatDate(d.expiryDate) : null,
          })),
        };
      },
    },
    {
      name: "get_policies",
      description: "Published policies and organisation-wide acknowledgement progress.",
      parameters: emptySchema,
      execute: async () => {
        const [policies, byStatus] = await Promise.all([
          prisma.policy.findMany({
            where: { organisationId: org },
            orderBy: { title: "asc" },
            select: {
              title: true, category: true, version: true, isMandatory: true,
              _count: { select: { acknowledgements: true } },
            },
          }),
          prisma.policyAcknowledgement.groupBy({ by: ["status"], where: { organisationId: org }, _count: true }),
        ]);
        return {
          policies: policies.map((p) => ({
            title: p.title,
            category: p.category,
            version: p.version,
            mandatory: p.isMandatory,
            acknowledgements: p._count.acknowledgements,
          })),
          acknowledgementStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
        };
      },
    },
    {
      name: "get_attendance_summary",
      description: "Organisation attendance for recent days: records by status and total hours.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "Window in days (default 7, max 30)" } },
      },
      execute: async (args) => {
        const days = clampLimit(args["days"], 7, 30);
        const [byStatus, agg] = await Promise.all([
          prisma.attendanceRecord.groupBy({
            by: ["status"],
            where: { organisationId: org, date: { gte: D(-days + 1) } },
            _count: true,
          }),
          prisma.attendanceRecord.aggregate({
            where: { organisationId: org, date: { gte: D(-days + 1) } },
            _sum: { workedMinutes: true, overtimeMinutes: true },
          }),
        ]);
        return {
          windowDays: days,
          byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
          totalHours: Math.round((num(agg._sum.workedMinutes) / 60) * 10) / 10,
          overtimeHours: Math.round((num(agg._sum.overtimeMinutes) / 60) * 10) / 10,
        };
      },
    },
    {
      name: "get_timesheets_summary",
      description: "Organisation timesheet pipeline by status (draft, submitted, approved, rejected, paid).",
      parameters: emptySchema,
      execute: async () => {
        const byStatus = await prisma.timesheet.groupBy({ by: ["status"], where: { organisationId: org }, _count: true });
        return { byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })) };
      },
    },
    {
      name: "get_notifications",
      description: "The organisation's recent in-app notifications.",
      parameters: limitSchema,
      execute: async (args) => {
        const limit = clampLimit(args["limit"], 8);
        const rows = await prisma.orgNotification.findMany({
          where: { organisationId: org },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { title: true, body: true, isRead: true, createdAt: true },
        });
        return {
          unread: rows.filter((r) => !r.isRead).length,
          notifications: rows.map((n) => ({
            title: n.title,
            body: n.body,
            read: n.isRead,
            when: formatDate(n.createdAt),
          })),
        };
      },
    },
  ];
}

const HR_PORTAL_GUIDE = `PORTAL GUIDE (HR Admin console):
- Dashboard: /hr/dashboard
- Employee Management: all /hr/employees, add /hr/employees/new, details /hr/employees/details, documents /hr/employees/documents, certifications /hr/employees/certifications, history /hr/employees/history
- Onboarding: new starters /hr/onboarding/new-starters, checklists /hr/onboarding/checklists, tasks /hr/onboarding/tasks, required documents /hr/onboarding/documents
- Offboarding: leaving /hr/offboarding/leaving, exit checklist /hr/offboarding/checklist, exit documents /hr/offboarding/documents
- Leave: requests /hr/leave/requests, approve/reject /hr/leave/approvals, balances /hr/leave/balances, types /hr/leave/types, history /hr/leave/history
- Documents: all /hr/documents, upload /hr/documents/upload, per employee /hr/documents/employees, expiry tracking /hr/documents/expiry
- Policies: /hr/policies, create/update /hr/policies/new, acknowledgements /hr/policies/acknowledgements
- Certifications: all /hr/certifications, expiring /hr/certifications/expiring, records /hr/certifications/records
- HR Reports: /hr/reports/employees, /hr/reports/headcount, /hr/reports/leave, /hr/reports/onboarding, /hr/reports/offboarding
- Tasks & Approvals: /hr/tasks, employee requests /hr/tasks/requests, document approvals /hr/tasks/document-approvals
- Notifications: /hr/notifications, policy reminders /hr/notifications/policy-reminders, expiry reminders /hr/notifications/expiry-reminders
- HR Settings: /hr/settings, leave rules /hr/settings/leave-rules, onboarding /hr/settings/onboarding, documents /hr/settings/documents, notifications /hr/settings/notifications`;

function buildSystemPrompt(ctx: HrAiContext): string {
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `You are the PeopleCore HR Admin assistant for the HR team at ${ctx.orgName} (greeting user: ${ctx.firstName}).

Current date: ${dayNames[now.getDay()]}, ${formatDate(now)}.

RULES
- Answer ONLY from the tools provided — they return live figures for this organisation. Never invent numbers, names or dates.
- These are HR-console answers: organisation-wide people data is allowed, but never payroll bank details or tax file numbers.
- If a tool returns empty data, say so plainly instead of guessing.
- Mirror the user's language: English or Hinglish.
- Keep answers short (2-5 sentences). Use compact bullets when listing. No markdown tables.
- For "how do I / where do I" questions use the PORTAL GUIDE and give the exact route path, e.g. (/hr/leave/approvals).
- Money is AUD. Dates are Australian format (DD Mon YYYY).

${HR_PORTAL_GUIDE}`;
}

/** Try the live LLM; return null when unconfigured or failed. */
export async function answerWithAI(
  ctx: HrAiContext,
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
