import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { aiStatus, runAiToolLoop, type AiChatMessage, type AiTool } from "@/lib/ai/llm";
import { answerNamedOrganisation } from "@/lib/ai/lookup";
import type { AssistantReply } from "./assistant-engine";

export type PlatformAiContext = { firstName: string };

const num = (v: unknown) => Number(v ?? 0);

const emptySchema: Record<string, unknown> = { type: "object", properties: {} };
const limitSchema = {
  type: "object",
  properties: { limit: { type: "number", description: "Max rows to return (1-10)" } },
};

/** Tools for the Super Admin (platform) console — platform-wide scope. */
function makeTools(): AiTool[] {
  return [
    {
      name: "lookup_organisation",
      description:
        "Answer about ONE named organisation: status, employee count, plan and subscription, integrations and sync activity. Pass the name exactly as the user said it.",
      parameters: {
        type: "object",
        properties: { organisation_name: { type: "string", description: "The organisation's name, e.g. 'Coral Coast Tourism'" } },
        required: ["organisation_name"],
      },
      execute: async (args) => {
        const q = String(args["organisation_name"] ?? "").trim();
        if (!q) return { note: "No organisation name provided." };
        return (await answerNamedOrganisation(q)) ?? { note: `No organisation named "${q}" was found.` };
      },
    },
    {
      name: "get_organisations",
      description: "Platform organisation counts by status, plus the most recently created tenants.",
      parameters: limitSchema,
      execute: async () => {
        const [total, byStatus, recent] = await Promise.all([
          prisma.organisation.count(),
          prisma.organisation.groupBy({ by: ["status"], _count: true }),
          prisma.organisation.findMany({
            orderBy: { createdAt: "desc" },
            take: 6,
            select: { name: true, status: true, employeeCount: true, createdAt: true },
          }),
        ]);
        return {
          total,
          byStatus: byStatus.map((b) => ({ status: b.status, count: b._count })),
          recent: recent.map((o) => ({
            name: o.name,
            status: o.status,
            employees: o.employeeCount,
            created: formatDate(o.createdAt),
          })),
        };
      },
    },
    {
      name: "get_subscriptions",
      description: "Subscription counts and value by status and by plan (recurring revenue).",
      parameters: emptySchema,
      execute: async () => {
        const [byStatus, byPlan, plans] = await Promise.all([
          prisma.organisationSubscription.groupBy({ by: ["status"], _count: true, _sum: { amount: true } }),
          prisma.organisationSubscription.groupBy({
            by: ["planId"],
            where: { status: { in: ["ACTIVE", "TRIALING"] } },
            _count: true,
            _sum: { amount: true },
          }),
          prisma.plan.findMany({ select: { id: true, name: true } }),
        ]);
        const nameOf = (id: string) => plans.find((p) => p.id === id)?.name ?? "Unknown plan";
        return {
          byStatus: byStatus.map((b) => ({ status: b.status, count: b._count, value: formatMoney(num(b._sum.amount)) })),
          byPlan: byPlan.map((b) => ({
            plan: nameOf(b.planId),
            count: b._count,
            value: formatMoney(num(b._sum.amount)),
          })),
        };
      },
    },
    {
      name: "get_plans",
      description: "Configured plans with monthly/annual pricing and trial length.",
      parameters: emptySchema,
      execute: async () => {
        const plans = await prisma.plan.findMany({
          orderBy: { sortOrder: "asc" },
          select: { name: true, priceMonthly: true, priceAnnual: true, trialDays: true, isActive: true },
        });
        return plans.map((p) => ({
          plan: p.name,
          monthly: formatMoney(num(p.priceMonthly)),
          annual: formatMoney(num(p.priceAnnual)),
          trialDays: p.trialDays,
          active: p.isActive,
        }));
      },
    },
    {
      name: "get_platform_users",
      description: "Console accounts: total, active/suspended, platform vs organisation-scoped.",
      parameters: emptySchema,
      execute: async () => {
        const [total, active, suspended, platform, orgScoped] = await Promise.all([
          prisma.user.count(),
          prisma.user.count({ where: { status: "ACTIVE" } }),
          prisma.user.count({ where: { status: "SUSPENDED" } }),
          prisma.user.count({ where: { organisationId: null } }),
          prisma.user.count({ where: { organisationId: { not: null } } }),
        ]);
        return { total, active, suspended, platformAccounts: platform, organisationMembers: orgScoped };
      },
    },
    {
      name: "get_roles",
      description: "Roles defined and how many members each has.",
      parameters: emptySchema,
      execute: async () => {
        const [roles, assignments, top] = await Promise.all([
          prisma.role.count(),
          prisma.roleAssignment.count(),
          prisma.role.findMany({
            select: { name: true, _count: { select: { assignments: true } } },
            orderBy: { name: "asc" },
            take: 12,
          }),
        ]);
        return {
          totalRoles: roles,
          totalAssignments: assignments,
          topRoles: top.map((r) => ({ role: r.name, members: r._count.assignments })),
        };
      },
    },
    {
      name: "get_integrations_health",
      description: "Integration catalogue size, organisation connections by status, and sync success rate.",
      parameters: emptySchema,
      execute: async () => {
        const [catalog, connected, byStatus, total, success, failed, last] = await Promise.all([
          prisma.integration.count(),
          prisma.organisationIntegration.count(),
          prisma.organisationIntegration.groupBy({ by: ["status"], _count: true }),
          prisma.syncLog.count(),
          prisma.syncLog.count({ where: { status: "SUCCESS" } }),
          prisma.syncLog.count({ where: { status: "FAILED" } }),
          prisma.syncLog.findFirst({
            orderBy: { startedAt: "desc" },
            include: { integration: { select: { name: true } } },
          }),
        ]);
        return {
          catalogue: catalog,
          connections: connected,
          connectionsByStatus: byStatus.map((b) => ({ status: b.status, count: b._count })),
          syncRuns: total,
          syncSucceeded: success,
          syncFailed: failed,
          successRate: total > 0 ? `${Math.round((success / total) * 100)}%` : null,
          lastRun: last
            ? { integration: last.integration.name, status: last.status, startedAt: formatDateTime(last.startedAt) }
            : null,
        };
      },
    },
    {
      name: "get_errors",
      description: "Unresolved platform errors by severity, and the most recent errors.",
      parameters: emptySchema,
      execute: async () => {
        const [unresolved, bySeverity, recent] = await Promise.all([
          prisma.errorLog.count({ where: { resolved: false } }),
          prisma.errorLog.groupBy({ by: ["severity"], where: { resolved: false }, _count: true }),
          prisma.errorLog.findMany({
            orderBy: { occurredAt: "desc" },
            take: 6,
            select: { severity: true, source: true, message: true, occurredAt: true, resolved: true },
          }),
        ]);
        return {
          unresolved,
          bySeverity: bySeverity.map((b) => ({ severity: b.severity, count: b._count })),
          recent: recent.map((e) => ({
            severity: e.severity,
            source: e.source,
            message: e.message,
            when: formatDateTime(e.occurredAt),
            resolved: e.resolved,
          })),
        };
      },
    },
    {
      name: "get_jobs",
      description: "Background jobs by status and recent failures.",
      parameters: emptySchema,
      execute: async () => {
        const [byStatus, failed] = await Promise.all([
          prisma.job.groupBy({ by: ["status"], _count: true }),
          prisma.job.findMany({
            where: { status: "FAILED" },
            orderBy: { queuedAt: "desc" },
            take: 5,
            select: { name: true, attempts: true, error: true, queuedAt: true },
          }),
        ]);
        return {
          byStatus: byStatus.map((b) => ({ status: b.status, count: b._count })),
          recentFailures: failed.map((j) => ({
            job: j.name,
            attempts: j.attempts,
            error: j.error,
            queued: formatDateTime(j.queuedAt),
          })),
        };
      },
    },
    {
      name: "get_audit_activity",
      description: "Recent audit activity: events in the last 24 hours and the most recent entries.",
      parameters: emptySchema,
      execute: async () => {
        const since = new Date(Date.now() - 86400_000);
        const [today, byCategory, recent] = await Promise.all([
          prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
          prisma.auditLog.groupBy({ by: ["category"], where: { createdAt: { gte: since } }, _count: true }),
          prisma.auditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 6,
            select: { action: true, category: true, createdAt: true },
          }),
        ]);
        return {
          last24h: today,
          byCategory: byCategory.map((b) => ({ category: b.category, count: b._count })),
          recent: recent.map((a) => ({ action: a.action, category: a.category, when: formatDateTime(a.createdAt) })),
        };
      },
    },
    {
      name: "get_sessions",
      description: "Active, revoked and expired console sessions.",
      parameters: emptySchema,
      execute: async () => {
        const now = new Date();
        const [active, revoked, expired] = await Promise.all([
          prisma.userSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
          prisma.userSession.count({ where: { revokedAt: { not: null } } }),
          prisma.userSession.count({ where: { revokedAt: null, expiresAt: { lte: now } } }),
        ]);
        return { active, revoked, expired };
      },
    },
    {
      name: "get_tenants_by_size",
      description: "Largest organisations by employee count.",
      parameters: emptySchema,
      execute: async () => {
        const orgs = await prisma.organisation.findMany({
          orderBy: { employeeCount: "desc" },
          take: 8,
          select: { name: true, employeeCount: true, status: true },
        });
        return orgs.map((o) => ({ organisation: o.name, employees: o.employeeCount, status: o.status }));
      },
    },
  ];
}

const PLATFORM_PORTAL_GUIDE = `PORTAL GUIDE (Super Admin / platform console):
- Dashboard: /dashboard
- Organisations: all /organisations, create /organisations/create, disabled /organisations/disabled
- Subscriptions: plans /subscriptions/plans, organisation subscriptions /subscriptions/organisations
- Integrations: /integrations, mapping /integrations/mapping, sync logs /integrations/sync-logs
- System Configuration: business rules /configuration/business-rules, permissions /configuration/permissions, notifications /configuration/notifications, global settings /configuration/global-settings
- Platform Diagnostics: system health /diagnostics/system-health, errors /diagnostics/errors, jobs /diagnostics/jobs, integration health /diagnostics/integration-health
- Security: users /security/users, roles /security/roles, permissions /security/permissions, sessions /security/sessions
- Audit Logs: /audit-logs
- Settings: /settings`;

function buildSystemPrompt(ctx: PlatformAiContext): string {
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `You are the PeopleCore Super Admin platform assistant (greeting user: ${ctx.firstName}).

Current date: ${dayNames[now.getDay()]}, ${formatDate(now)}.

You serve platform operators and answer questions about ALL tenants and the platform itself.

RULES
- Answer ONLY from the tools provided — they return live platform-wide figures. Never invent numbers, names or dates.
- Never expose personal, bank or tax data of any individual; report aggregates only.
- If a tool returns empty data, say so plainly instead of guessing.
- Mirror the user's language: English or Hinglish.
- Keep answers short (2-5 sentences). Use compact bullets when listing. No markdown tables.
- For questions about one named organisation ("tell me about Coral Coast Tourism"), call lookup_organisation.
- For "how do I / where do I" questions use the PORTAL GUIDE and give the exact route path.
- Money is AUD. Dates are Australian format (DD Mon YYYY).

${PLATFORM_PORTAL_GUIDE}`;
}

/** Try the live LLM; return null when unconfigured or failed. */
export async function answerWithAI(
  ctx: PlatformAiContext,
  question: string,
  history: AiChatMessage[] = []
): Promise<AssistantReply | null> {
  const status = aiStatus();
  if (!status.enabled) return null;

  const text = await runAiToolLoop({
    system: buildSystemPrompt(ctx),
    messages: [...history.slice(-6), { role: "user", content: question }],
    tools: makeTools(),
  });
  if (!text) return null;

  return { intent: "ai", answer: text, table: null };
}
