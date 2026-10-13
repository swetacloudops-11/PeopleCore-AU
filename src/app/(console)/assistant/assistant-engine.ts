import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

/**
 * Deterministic "assistant" for the Super Admin (platform) console.
 * No external AI API required: each question maps to an intent answered from
 * live platform-wide aggregates. Server-only.
 */

export type AssistantTable = { headers: string[]; rows: string[][] };

export type AssistantReply = {
  intent: string;
  answer: string;
  table?: AssistantTable | null;
};

export const SUGGESTIONS = [
  "How many organisations are on the platform?",
  "What is our recurring revenue?",
  "Are there any critical errors?",
  "How healthy are the integrations?",
  "How many users have access?",
  "What subscriptions are past due?",
  "What is our biggest tenant?",
  "Are any background jobs failing?",
  "What happened in the audit log today?",
  "Which plans are most popular?",
];

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);
const num = (v: unknown) => Number(v ?? 0);
const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));
const title = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

type Handler = () => Promise<Omit<AssistantReply, "intent">>;
type Intent = { intent: string; test: RegExp; run: () => Handler };

const INTENTS: Intent[] = [
  {
    intent: "tenants_by_size",
    test: /biggest|largest|most employees|by size|top tenant|by employee count/,
    run: () => async () => {
      const orgs = await prisma.organisation.findMany({
        orderBy: { employeeCount: "desc" },
        take: 8,
        select: { name: true, employeeCount: true, status: true },
      });
      const total = await prisma.organisation.count();
      return {
        answer: `Largest organisation(s) by employee count (out of ${total} tenants).`,
        table: orgs.length
          ? {
              headers: ["Organisation", "Employees", "Status"],
              rows: orgs.map((o) => [o.name, String(o.employeeCount), title(o.status)]),
            }
          : null,
      };
    },
  },
  {
    intent: "organisations_overview",
    test: /organi[sz]ation|tenant|how many (companies|clients)|customers/,
    run: () => async () => {
      const [total, byStatus, recent] = await Promise.all([
        prisma.organisation.count(),
        prisma.organisation.groupBy({ by: ["status"], _count: true }),
        prisma.organisation.findMany({
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { name: true, status: true, employeeCount: true, createdAt: true },
        }),
      ]);
      const countOf = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;

      return {
        answer:
          `${total} organisation(s) on the platform: ${countOf("ACTIVE")} active, ` +
          `${countOf("DISABLED")} disabled, ${countOf("PENDING")} pending.`,
        table: recent.length
          ? {
              headers: ["Organisation", "Status", "Employees", "Created"],
              rows: recent.map((o) => [
                o.name,
                title(o.status),
                String(o.employeeCount),
                formatDate(o.createdAt),
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "subscriptions",
    test: /subscription|recurring revenue|mrr|arr|billing|past due|revenue/,
    run: () => async () => {
      const [byStatus, active, byPlan] = await Promise.all([
        prisma.organisationSubscription.groupBy({ by: ["status"], _count: true, _sum: { amount: true } }),
        prisma.organisationSubscription.aggregate({
          where: { status: { in: ["ACTIVE", "TRIALING"] } },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.organisationSubscription.groupBy({
          by: ["planId"],
          where: { status: { in: ["ACTIVE", "TRIALING"] } },
          _count: true,
          _sum: { amount: true },
        }),
      ]);
      const plans = await prisma.plan.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } });
      const nameOf = (id: string) => plans.find((p) => p.id === id)?.name ?? "Unknown plan";
      const countOf = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
      const mrr = num(active._sum.amount);

      const planTable: AssistantTable | null = byPlan.length
        ? {
            headers: ["Plan", "Subscriptions", "Value"],
            rows: byPlan
              .map((b) => [nameOf(b.planId), String(b._count), formatMoney(num(b._sum.amount))])
              .sort((a, b) => Number(b[1]) - Number(a[1])),
          }
        : byStatus.length
        ? {
            headers: ["Status", "Subscriptions", "Value"],
            rows: byStatus.map((b) => [title(b.status), String(b._count), formatMoney(num(b._sum.amount))]),
          }
        : null;

      return {
        answer:
          `${active._count} active/trialling subscription(s) worth about ${formatMoney(mrr)} per billing period. ` +
          `${countOf("PAST_DUE")} past due, ${countOf("CANCELLED")} cancelled, ${countOf("EXPIRED")} expired.`,
        table: planTable,
      };
    },
  },
  {
    intent: "plans",
    test: /plans?|pricing tier|packages?|editions?/,
    run: () => async () => {
      const plans = await prisma.plan.findMany({
        orderBy: { sortOrder: "asc" },
        select: { name: true, code: true, priceMonthly: true, priceAnnual: true, isActive: true, trialDays: true },
      });
      return {
        answer: `${plans.length} plan(s) are configured (${plans.filter((p) => p.isActive).length} active).`,
        table: plans.length
          ? {
              headers: ["Plan", "Monthly", "Annual", "Trial (days)", "State"],
              rows: plans.map((p) => [
                p.name,
                formatMoney(num(p.priceMonthly)),
                formatMoney(num(p.priceAnnual)),
                String(p.trialDays),
                p.isActive ? "Active" : "Inactive",
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "platform_users",
    test: /\busers?\b|accounts?|who has access|sign.?ins?\b/,
    run: () => async () => {
      const [total, active, suspended, platform, orgScoped] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { status: "ACTIVE" } }),
        prisma.user.count({ where: { status: "SUSPENDED" } }),
        prisma.user.count({ where: { organisationId: null } }),
        prisma.user.count({ where: { organisationId: { not: null } } }),
      ]);
      return {
        answer:
          `${total} console account(s) exist: ${active} active, ${suspended} suspended. ` +
          `${platform} are platform (super admin) accounts and ${orgScoped} belong to organisations.`,
        table: {
          headers: ["Scope", "Accounts"],
          rows: [
            ["Platform (no organisation)", String(platform)],
            ["Organisation members", String(orgScoped)],
          ],
        },
      };
    },
  },
  {
    intent: "roles",
    test: /\broles?\b|permissions?|rbac|access level/,
    run: () => async () => {
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
        answer: `${roles} role(s) are defined with ${assignments} assignment(s) in total.`,
        table: top.length
          ? {
              headers: ["Role", "Members"],
              rows: top
                .map((r) => [r.name, String(r._count.assignments)])
                .sort((a, b) => Number(b[1]) - Number(a[1])),
            }
          : null,
      };
    },
  },
  {
    intent: "integrations_health",
    test: /integrat|sync|connector|data flow|webhook/,
    run: () => async () => {
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
        answer:
          `${catalog} integration(s) in the catalogue, ${connected} organisation connection(s). ` +
          (total === 0
            ? "No sync runs logged yet."
            : `${total} sync run(s) at ${pct(success, total)}% success (${failed} failed).`) +
          (last ? ` Latest: ${last.integration.name} · ${title(last.status)}.` : ""),
        table: byStatus.length
          ? {
              headers: ["Connection status", "Count"],
              rows: byStatus.map((b) => [title(b.status), String(b._count)]),
            }
          : null,
      };
    },
  },
  {
    intent: "errors",
    test: /error|exception|bug|incident|crash|critical/,
    run: () => async () => {
      const [unresolved, bySeverity, recent] = await Promise.all([
        prisma.errorLog.count({ where: { resolved: false } }),
        prisma.errorLog.groupBy({ by: ["severity"], where: { resolved: false }, _count: true }),
        prisma.errorLog.findMany({
          orderBy: { occurredAt: "desc" },
          take: 6,
          select: { severity: true, source: true, message: true, occurredAt: true, resolved: true },
        }),
      ]);
      const countOf = (s: string) => bySeverity.find((b) => b.severity === s)?._count ?? 0;

      return {
        answer:
          unresolved === 0
            ? "No unresolved errors — the platform is clear."
            : `${unresolved} unresolved error(s): ${countOf("CRITICAL")} critical, ${countOf("ERROR")} error, ` +
              `${countOf("WARNING")} warning.`,
        table: recent.length
          ? {
              headers: ["Severity", "Source", "Message", "When"],
              rows: recent.map((e) => [
                title(e.severity),
                e.source,
                e.message.length > 70 ? `${e.message.slice(0, 70)}…` : e.message,
                formatDateTime(e.occurredAt),
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "jobs",
    test: /jobs?|queue|worker|scheduled task|cron/,
    run: () => async () => {
      const [byStatus, recentFail] = await Promise.all([
        prisma.job.groupBy({ by: ["status"], _count: true }),
        prisma.job.findMany({
          where: { status: "FAILED" },
          orderBy: { queuedAt: "desc" },
          take: 5,
          select: { name: true, attempts: true, error: true, queuedAt: true },
        }),
      ]);
      const countOf = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
      const total = byStatus.reduce((a, b) => a + b._count, 0);

      return {
        answer:
          total === 0
            ? "No background jobs have been queued."
            : `${total} job(s): ${countOf("QUEUED")} queued, ${countOf("RUNNING")} running, ${countOf("SUCCEEDED")} succeeded, ${countOf("FAILED")} failed.`,
        table: recentFail.length
          ? {
              headers: ["Failed job", "Attempts", "Error", "Queued"],
              rows: recentFail.map((j) => [
                j.name,
                String(j.attempts),
                j.error ? (j.error.length > 50 ? `${j.error.slice(0, 50)}…` : j.error) : "—",
                formatDateTime(j.queuedAt),
              ]),
            }
          : null,
      };
    },
  },
  {
    intent: "audit_activity",
    test: /audit|activity|who did|recent actions|audit trail|log of changes/,
    run: () => async () => {
      const pending = daysAgo(1);
      const [today, byCategory, recent] = await Promise.all([
        prisma.auditLog.count({ where: { createdAt: { gte: pending } } }),
        prisma.auditLog.groupBy({ by: ["category"], where: { createdAt: { gte: daysAgo(30) } }, _count: true }),
        prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { action: true, category: true, description: true, createdAt: true },
        }),
      ]);

      return {
        answer:
          today === 0
            ? "No audit activity in the last 24 hours."
            : `${today} audit event(s) in the last 24 hours across ${byCategory.length} categories.`,
        table: recent.length
          ? {
              headers: ["When", "Action", "Category"],
              rows: recent.map((a) => [formatDateTime(a.createdAt), a.action, a.category]),
            }
          : null,
      };
    },
  },
  {
    intent: "sessions",
    test: /sessions?|logged in|active logins|signed in/,
    run: () => async () => {
      const now = new Date();
      const [active, revoked, expired] = await Promise.all([
        prisma.userSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
        prisma.userSession.count({ where: { revokedAt: { not: null } } }),
        prisma.userSession.count({ where: { revokedAt: null, expiresAt: { lte: now } } }),
      ]);
      return {
        answer: `${active} session(s) are currently active. ${revoked} have been revoked and ${expired} have expired.`,
        table: {
          headers: ["State", "Sessions"],
          rows: [
            ["Active", String(active)],
            ["Revoked", String(revoked)],
            ["Expired", String(expired)],
          ],
        },
      };
    },
  },
];

export const CAPABILITIES = [
  "organisation counts and status",
  "subscriptions and recurring revenue",
  "plans and pricing",
  "platform users and roles",
  "integration and sync health",
  "unresolved platform errors",
  "background jobs and failures",
  "audit activity",
  "active sessions",
  "largest tenants",
];

export function describeCapabilities(): string {
  return CAPABILITIES.map((c) => `• ${c}`).join("\n");
}

/** Answer a natural-language question with live platform-wide aggregates. */
export async function answerQuestion(question: string): Promise<AssistantReply> {
  const q = question.toLowerCase().trim();

  const scored = INTENTS.map((i) => ({
    intent: i,
    score: (q.match(new RegExp(i.test.source, "gi")) ?? []).length,
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const match = scored[0]?.intent;

  if (!match) {
    return {
      intent: "unknown",
      answer:
        `I can't answer that one yet — I only know about platform-wide data.\n` +
        `Here is what I can help with:\n${describeCapabilities()}`,
      table: null,
    };
  }

  try {
    const reply = await match.run()();
    return { intent: match.intent, answer: reply.answer, table: reply.table ?? null };
  } catch (err) {
    console.error("[platform-assistant] intent failed", match.intent, err);
    return {
      intent: match.intent,
      answer: "I hit a problem while pulling that data — please try again in a moment.",
      table: null,
    };
  }
}
