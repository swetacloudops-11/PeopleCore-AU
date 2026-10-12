import { PrismaClient, Prisma, SyncStatus, RuleDataType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

const ORG_NAMES = [
  "Harbour Logistics Pty Ltd", "Southern Cross Healthcare", "Bright Path Childcare",
  "Kangaroo Ridge Mining", "Cobalt & Co Accounting", "Blue Wren Retail Group",
  "Tanami Construction", "Reef Point Hospitality", "Ironbark Manufacturing",
  "Silver Gully Wines", "Pilbara Energy Solutions", "Murray River Farms",
  "Crimson Rosella Media", "Nova Dental Partners", "Sandstone Property Group",
  "Willow Tree Legal", "Eastern Creek Transport", "Seabright Fisheries",
  "Granite Peak Consulting", "Jacaranda Learning Centres", "Redgum Hospitality",
  "Southern Cloud Software", "Bayview Marine Services", "Acacia Payroll Bureau",
  "Hunter Valley Quarries", "Lighthouse Financial Advice", "Top End Aviation",
  "Golden Plains Dairy", "Wattle & Sage Organics", "Coral Coast Tourism",
];

const INDUSTRIES = ["Logistics", "Healthcare", "Childcare", "Mining", "Accounting", "Retail", "Construction", "Hospitality", "Manufacturing", "Wine", "Energy", "Agriculture"];
const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const CITIES = ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Hobart", "Canberra", "Darwin"];

async function main() {
  console.log("Seeding PeopleCore_tst …");

  // ── Auth: super admin + supporting accounts ──────────────────────────
  const passwordHash = await bcrypt.hash("Admin@1234", 10);
  const otherHash = await bcrypt.hash("Admin@1234", 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: "super@jabit.com" },
    update: { passwordHash, name: "Platform Super Admin", status: "ACTIVE" },
    create: {
      email: "super@jabit.com",
      passwordHash,
      name: "Platform Super Admin",
      status: "ACTIVE",
      lastLoginAt: new Date(Date.now() - 1000 * 60 * 42),
    },
  });

  const otherUsers = await Promise.all(
    [
      ["ops@jabit.com", "Ops Manager"],
      ["security@jabit.com", "Security Officer"],
      ["billing@jabit.com", "Billing Analyst"],
    ].map(([email, name]) =>
      prisma.user.upsert({
        where: { email: email! },
        update: {},
        create: { email: email!, name: name!, passwordHash: otherHash },
      })
    )
  );

  // ── Security: roles + permissions ────────────────────────────────────
  const roleDefs = [
    ["SUPER_ADMIN", "Super Admin", "Full platform control", true],
    ["PLATFORM_OPS", "Platform Operations", "Day-to-day platform operations", true],
    ["SECURITY_AUDITOR", "Security Auditor", "Read-only security and audit access", true],
    ["BILLING_ADMIN", "Billing Admin", "Plans and subscription management", false],
  ] as const;

  const roles: Record<string, string> = {};
  for (const [key, name, description, isSystem] of roleDefs) {
    const r = await prisma.role.upsert({
      where: { key },
      update: { name, description },
      create: { key, name, description, isSystem },
    });
    roles[key] = r.id;
  }

  const permissionDefs: Array<[string, string, string]> = [
    ["org.view", "Organisations", "View organisations"],
    ["org.create", "Organisations", "Create organisations"],
    ["org.disable", "Organisations", "Disable / enable organisations"],
    ["org.delete", "Organisations", "Delete organisations"],
    ["sub.view", "Subscriptions", "View subscriptions"],
    ["sub.manage", "Subscriptions", "Manage plans and subscriptions"],
    ["int.view", "Integrations", "View integrations"],
    ["int.manage", "Integrations", "Configure integration mappings"],
    ["int.sync", "Integrations", "Trigger synchronisation"],
    ["cfg.view", "System Configuration", "View configuration"],
    ["cfg.manage", "System Configuration", "Modify business rules and settings"],
    ["diag.view", "Platform Diagnostics", "View platform diagnostics"],
    ["diag.manage", "Platform Diagnostics", "Resolve errors and manage jobs"],
    ["sec.view", "Security", "View roles, permissions and sessions"],
    ["sec.manage", "Security", "Manage roles and revoke sessions"],
    ["audit.view", "Audit Logs", "View audit logs"],
    ["settings.manage", "Settings", "Manage platform settings"],
  ];

  const perms: Record<string, string> = {};
  for (const [key, module, description] of permissionDefs) {
    const action = key.split(".")[1];
    const p = await prisma.permission.upsert({
      where: { key },
      update: { module, action, description },
      create: { key, module, action, description },
    });
    perms[key] = p.id;
  }

  const roleMatrix: Record<string, string[]> = {
    SUPER_ADMIN: Object.keys(perms),
    PLATFORM_OPS: ["org.view", "org.create", "int.view", "int.manage", "int.sync", "cfg.view", "diag.view", "diag.manage", "audit.view", "sub.view"],
    SECURITY_AUDITOR: ["org.view", "sub.view", "int.view", "cfg.view", "diag.view", "sec.view", "audit.view"],
    BILLING_ADMIN: ["org.view", "sub.view", "sub.manage", "audit.view", "settings.manage"],
  };

  for (const [roleKey, allowed] of Object.entries(roleMatrix)) {
    for (const permKey of allowed) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: roles[roleKey], permissionId: perms[permKey] } },
        update: { allowed: true },
        create: { roleId: roles[roleKey], permissionId: perms[permKey], allowed: true },
      });
    }
  }

  await prisma.roleAssignment.deleteMany({ where: { userId: superAdmin.id } });
  await prisma.roleAssignment.create({
    data: { userId: superAdmin.id, roleId: roles.SUPER_ADMIN },
  });
  await prisma.roleAssignment.createMany({
    data: [
      { userId: otherUsers[0].id, roleId: roles.PLATFORM_OPS },
      { userId: otherUsers[1].id, roleId: roles.SECURITY_AUDITOR },
      { userId: otherUsers[2].id, roleId: roles.BILLING_ADMIN },
    ],
    skipDuplicates: true,
  });

  // ── Subscription plans ───────────────────────────────────────────────
  const planDefs: Array<{
    code: string;
    name: string;
    description: string;
    priceMonthly: number;
    priceAnnual: number;
    maxEmployees: number;
    maxOrganisations: number;
    trialDays: number;
    features: string[];
    isActive?: boolean;
  }> = [
    { code: "STARTER", name: "Starter", description: "Small teams getting started", priceMonthly: 49, priceAnnual: 490, maxEmployees: 25, maxOrganisations: 1, trialDays: 14, features: ["Payroll", "Leave", "Reports"] },
    { code: "GROWTH", name: "Growth", description: "Growing businesses with multiple sites", priceMonthly: 149, priceAnnual: 1490, maxEmployees: 150, maxOrganisations: 5, trialDays: 30, features: ["Payroll", "Leave", "Reports", "Onboarding", "API access"] },
    { code: "BUSINESS", name: "Business", description: "Mid-market organisations", priceMonthly: 399, priceAnnual: 3990, maxEmployees: 500, maxOrganisations: 20, trialDays: 30, features: ["Everything in Growth", "Advanced analytics", "SSO", "Priority support"] },
    { code: "ENTERPRISE", name: "Enterprise", description: "Large enterprises with custom needs", priceMonthly: 1299, priceAnnual: 12990, maxEmployees: 0, maxOrganisations: 0, trialDays: 60, features: ["Everything in Business", "Dedicated CSM", "Custom integrations", "SLA 99.9%"] },
    { code: "LEGACY", name: "Legacy 2023", description: "Deprecated plan retained for existing orgs", priceMonthly: 99, priceAnnual: 990, maxEmployees: 100, maxOrganisations: 3, trialDays: 0, features: ["Payroll", "Leave"], isActive: false },
  ];

  const plans: Record<string, string> = {};
  for (let i = 0; i < planDefs.length; i++) {
    const def = planDefs[i];
    const isActive = def.isActive !== false;
    const p = await prisma.plan.upsert({
      where: { code: def.code },
      update: { name: def.name, description: def.description, priceMonthly: def.priceMonthly, priceAnnual: def.priceAnnual, maxEmployees: def.maxEmployees, maxOrganisations: def.maxOrganisations, trialDays: def.trialDays, features: def.features, isActive, sortOrder: i },
      create: { code: def.code, name: def.name, description: def.description, priceMonthly: def.priceMonthly, priceAnnual: def.priceAnnual, maxEmployees: def.maxEmployees, maxOrganisations: def.maxOrganisations, trialDays: def.trialDays, features: def.features, isActive, sortOrder: i },
    });
    plans[def.code] = p.id;
  }

  // ── Integrations catalogue ───────────────────────────────────────────
  const integrationDefs = [
    ["xero", "Xero", "Xero", "ACCOUNTING", true, true],
    ["myob", "MYOB", "MYOB", "ACCOUNTING", true, true],
    ["secondledger", "Second Ledger", "Banking", "BANKING", true, true],
    ["anz-banking", "ANZ Banking", "ANZ", "BANKING", false, false],
    ["cba-banking", "Commonwealth Banking", "CBA", "BANKING", false, false],
    ["google-workspace", "Google Workspace", "Google", "IDENTITY", true, true],
    ["microsoft-365", "Microsoft 365", "Microsoft", "IDENTITY", true, true],
    ["xero-payroll", "Xero Payroll", "Xero", "PAYROLL", false, false],
    ["keypay", "KeyPay", "KeyPay", "PAYROLL", false, false],
    ["workday", "Workday", "Workday", "HRIS", false, false],
    ["bamboohr", "BambooHR", "BambooHR", "HRIS", false, false],
    ["custom-rest-api", "Custom REST API", "Custom", "CUSTOM", false, false],
    ["webhook-relay", "Webhook Relay", "Custom", "CUSTOM", false, false],
    ["seek-talent", "SEEK Talent", "SEEK", "HRIS", false, false],
  ] as const;

  const integrations: Record<string, string> = {};
  for (let i = 0; i < integrationDefs.length; i++) {
    const [key, name, provider, category, isOfficial, active] = integrationDefs[i];
    const it = await prisma.integration.upsert({
      where: { key },
      update: {
        name,
        provider,
        category,
        isOfficial,
        status: active ? "ACTIVE" : "INACTIVE",
        sortOrder: i,
      },
      create: {
        key, name, provider, category, isOfficial,
        status: active ? "ACTIVE" : "INACTIVE",
        sortOrder: i,
        description: `${name} connectivity for payroll, leave and employee data synchronisation.`,
        websiteUrl: `https://example.com/${key}`,
        docsUrl: `https://developers.example.com/${key}`,
      },
    });
    integrations[key] = it.id;
  }

  // ── Organisations ────────────────────────────────────────────────────
  const planCodes = ["STARTER", "GROWTH", "BUSINESS", "ENTERPRISE"];
  const orgs: Array<{ id: string; name: string }> = [];

  for (let i = 0; i < ORG_NAMES.length; i++) {
    const name = ORG_NAMES[i];
    const orgSlug = slug(name);
    const disabled = i === 7 || i === 18 || i === 25;
    const pending = i === 12 || i === 27;
    const status = disabled ? "DISABLED" : pending ? "PENDING" : "ACTIVE";
    const created = new Date(Date.now() - 1000 * 60 * 60 * 24 * (30 + i * 7));

    const org = await prisma.organisation.upsert({
      where: { slug: orgSlug },
      update: { status },
      create: {
        name,
        slug: orgSlug,
        abn: `61 ${100 + i} ${300 + i} ${400 + i} ${500 + i}`,
        email: `hr@${orgSlug}.com.au`,
        phone: `0${2 + (i % 7)} ${9000 + i} ${1000 + i}`,
        addressLine1: `${10 + i} ${pick(["Harbour", "Station", "King", "Queen", "Church"], i)} Street`,
        city: pick(CITIES, i),
        state: pick(STATES, i),
        postcode: String(2000 + i * 37),
        country: "Australia",
        industry: pick(INDUSTRIES, i),
        employeeCount: 12 + ((i * 37) % 480),
        status,
        disabledReason: disabled ? "Payment overdue — account suspended" : null,
        disabledAt: disabled ? new Date(Date.now() - 1000 * 60 * 60 * 24 * (5 + i)) : null,
        createdAt: created,
      },
    });
    orgs.push({ id: org.id, name });

    // Subscription
    const planCode = pick(planCodes, i);
    const subStatus = disabled ? "PAST_DUE" : pending ? "TRIALING" : i % 9 === 0 ? "CANCELLED" : "ACTIVE";
    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    await prisma.organisationSubscription.upsert({
      where: { id: `sub_${orgSlug}` },
      update: { status: subStatus },
      create: {
        id: `sub_${orgSlug}`,
        organisationId: org.id,
        planId: plans[planCode],
        status: subStatus,
        cycle: i % 3 === 0 ? "ANNUAL" : "MONTHLY",
        seats: Math.max(1, Math.floor((org.employeeCount || 10) / 8)),
        startedAt: created,
        currentPeriodStart: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15),
        trialEndsAt: subStatus === "TRIALING" ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 9) : null,
        amount: plan?.priceMonthly ?? 0,
      },
    });

    // Integration mappings — a few per org
    const mappedKeys = ["xero", "myob", "google-workspace", "microsoft-365", "anz-banking"].filter((_, j) => (i + j) % 3 !== 0).slice(0, 3);
    for (const mk of mappedKeys) {
      const mapStatus = disabled ? "ERROR" : pending ? "PENDING" : (i + mk.length) % 7 === 0 ? "DISCONNECTED" : "CONNECTED";
      await prisma.organisationIntegration.upsert({
        where: { organisationId_integrationId: { organisationId: org.id, integrationId: integrations[mk] } },
        update: { status: mapStatus },
        create: {
          organisationId: org.id,
          integrationId: integrations[mk],
          status: mapStatus,
          externalAccountId: `${mk}-${1000 + i}`,
          externalAccountName: `${name} ${mk}`,
          scopes: ["read", "write"],
          connectedAt: mapStatus === "CONNECTED" ? new Date(Date.now() - 1000 * 60 * 60 * 24 * 20) : null,
          lastSyncAt: new Date(Date.now() - 1000 * 60 * (30 + i * 11)),
          lastSyncStatus: mapStatus === "ERROR" ? "FAILED" : "SUCCESS",
          errorMessage: mapStatus === "ERROR" ? "OAuth token expired — re-authorisation required" : null,
        },
      });
    }
  }

  // ── Sync logs ────────────────────────────────────────────────────────
  const existingSync = await prisma.syncLog.count();
  if (existingSync < 60) {
    const statuses: SyncStatus[] = ["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "PARTIAL", "FAILED", "SKIPPED"];
    const directions = ["INBOUND", "OUTBOUND", "BIDIRECTIONAL"];
    const triggers = ["MANUAL", "SCHEDULED", "WEBHOOK", "API"];
    const rows: Prisma.SyncLogCreateManyInput[] = [];

    for (let i = 0; i < 90; i++) {
      const org = orgs[i % orgs.length];
      const intKeys = Object.keys(integrations);
      const intKey = pick(intKeys, i);
      const status = pick(statuses, i);
      const total = 40 + ((i * 53) % 900);
      const failed = status === "FAILED" ? total : status === "PARTIAL" ? Math.ceil(total * 0.15) : 0;
      const started = new Date(Date.now() - 1000 * 60 * 60 * (i * 3 + 1));
      const duration = 400 + ((i * 137) % 8000);

      rows.push({
        organisationId: org.id,
        integrationId: integrations[intKey],
        direction: pick(directions, i),
        trigger: pick(triggers, i),
        status,
        recordsTotal: total,
        recordsSuccess: total - failed,
        recordsFailed: failed,
        durationMs: duration,
        message:
          status === "SUCCESS"
            ? `Synced ${total - failed} records successfully`
            : status === "FAILED"
            ? "Connection timed out while contacting provider API"
            : status === "PARTIAL"
            ? `${failed} records rejected due to validation errors`
            : "Skipped — no changes detected since last sync",
        errorCode: status === "FAILED" ? pick(["ETIMEDOUT", "401_UNAUTHORIZED", "RATE_LIMITED"], i) : null,
        startedAt: started,
        finishedAt: new Date(started.getTime() + duration),
      });
    }
    await prisma.syncLog.createMany({ data: rows });
  }

  // ── Business rules ───────────────────────────────────────────────────
  type RuleValue = string | number | boolean;
  const ruleDefs: Array<[string, string, string, string, RuleValue, string?]> = [
    ["max_organisations_per_tenant", "Maximum organisations per tenant", "Caps how many organisations a single owner may register.", "general", 25, "count"],
    ["default_probation_period", "Default probation period", "Applied to newly created employee records.", "people", 90, "days"],
    ["allow_self_service_leave", "Allow self-service leave", "Employees may submit leave requests without manager pre-approval.", "people", true],
    ["overtime_threshold", "Overtime threshold", "Hours per week before overtime rates apply.", "payroll", 38, "hours"],
    ["auto_disable_on_expiry", "Auto-disable on subscription expiry", "Automatically disable organisations when their subscription lapses.", "billing", true],
    ["max_login_attempts", "Maximum login attempts", "Lock the account temporarily after this many failed attempts.", "security", 5, "attempts"],
    ["session_timeout_minutes", "Session timeout", "Idle minutes before an admin session is invalidated.", "security", 60, "minutes"],
    ["audit_retention_days", "Audit log retention", "How long audit records are retained before archival.", "compliance", 365, "days"],
    ["enable_mfa_for_admins", "Require MFA for administrators", "Enforce multi-factor authentication for all console users.", "security", false],
    ["integration_sync_interval", "Integration sync interval", "Default polling interval for connected integrations.", "integrations", 15, "minutes"],
    ["max_seats_per_plan", "Maximum seats per plan", "Upper bound of seats assignable to a single subscription.", "billing", 500, "seats"],
    ["enable_signup", "Allow public signup", "New organisations may self-register on the platform.", "general", false],
  ];

  for (const [key, name, description, module, value, unit] of ruleDefs) {
    const dataType: RuleDataType =
      typeof value === "boolean" ? "BOOLEAN" : typeof value === "number" ? "NUMBER" : "STRING";
    await prisma.businessRule.upsert({
      where: { key },
      update: {},
      create: {
        key, name, description, module,
        value: String(value),
        dataType,
        unit: unit ?? null,
        isEnabled: key !== "enable_mfa_for_admins",
        isReadOnly: key === "audit_retention_days",
      },
    });
  }

  // ── Notification settings ────────────────────────────────────────────
  const notifDefs: Array<[string, string, string, string, string[], boolean]> = [
    ["org_created", "Organisation created", "Notify platform ops when a new organisation is registered.", "ORGANISATION", ["ops@jabit.com"], true],
    ["org_disabled", "Organisation disabled", "Alert when an organisation is disabled.", "ORGANISATION", ["ops@jabit.com", "billing@jabit.com"], true],
    ["subscription_expiring", "Subscription expiring", "Sent 7 days before a subscription period ends.", "BILLING", ["billing@jabit.com"], true],
    ["payment_failed", "Payment failed", "Alert when an invoice payment fails.", "BILLING", ["billing@jabit.com"], true],
    ["integration_error", "Integration sync failed", "Notify when a synchronisation job fails.", "INTEGRATION", ["ops@jabit.com"], true],
    ["integration_reauth", "Integration re-authorisation required", "OAuth token has expired for a mapping.", "INTEGRATION", ["ops@jabit.com"], true],
    ["job_failed", "Background job failed", "Sent when a queued job exhausts its retries.", "SYSTEM", ["ops@jabit.com"], true],
    ["security_login_anomaly", "Suspicious login detected", "Repeated failed sign-ins from a new location.", "SECURITY", ["security@jabit.com"], true],
    ["weekly_digest", "Weekly platform digest", "Summary of organisations, revenue and sync health.", "REPORTING", ["super@jabit.com"], false],
    ["mfa_enforced", "MFA enforcement changed", "Sent when the MFA requirement is toggled.", "SECURITY", ["security@jabit.com"], true],
  ];

  for (const [key, name, description, event, recipients, isEnabled] of notifDefs) {
    await prisma.notificationSetting.upsert({
      where: { key },
      update: {},
      create: { key, name, description, event, channel: "EMAIL", recipients, isEnabled },
    });
  }

  // ── Global settings ──────────────────────────────────────────────────
  const settingDefs: Array<[string, string, string, string, string, boolean]> = [
    ["general", "platform_name", "Platform name", "PeopleCore AU", "string", false],
    ["general", "support_email", "Support email", "support@peoplecore.com.au", "string", false],
    ["general", "support_phone", "Support phone", "1300 737 573", "string", false],
    ["general", "default_country", "Default country", "Australia", "string", false],
    ["general", "timezone", "Default timezone", "Australia/Sydney", "string", false],
    ["general", "date_format", "Date format", "DD/MM/YYYY", "string", false],
    ["branding", "primary_colour", "Primary colour", "#4f46e5", "string", false],
    ["branding", "logo_url", "Logo URL", "/logo.png", "string", false],
    ["security", "password_min_length", "Minimum password length", "10", "number", false],
    ["security", "session_expiry_hours", "Session expiry (hours)", "12", "number", false],
    ["security", "ip_allowlist", "IP allowlist", "", "string", false],
    ["security", "api_key", "Platform API key", "pc_live_9f2a7c1e4b8d3a6f", "string", true],
    ["integrations", "sync_timeout_seconds", "Sync timeout (seconds)", "60", "number", false],
    ["integrations", "webhook_signing_secret", "Webhook signing secret", "whsec_4b6d9a1f7c2e", "string", true],
    ["billing", "currency", "Billing currency", "AUD", "string", false],
    ["billing", "tax_rate", "GST rate", "10", "number", false],
    ["billing", "invoice_prefix", "Invoice prefix", "PCAU", "string", false],
  ];

  for (const [group, key, label, value, dataType, isSecret] of settingDefs) {
    await prisma.globalSetting.upsert({
      where: { key },
      update: {},
      create: { group, key, label, value, dataType, isSecret },
    });
  }

  // ── Diagnostics: errors ──────────────────────────────────────────────
  const errorCount = await prisma.errorLog.count();
  if (errorCount === 0) {
    const errorDefs = [
      ["integration", "ERROR", "Xero API returned 401 Unauthorized for org 'Reef Point Hospitality'", "OAuth refresh token rejected by provider", "/api/integrations/sync"],
      ["database", "WARNING", "Connection pool saturated — 20/20 connections in use", "Pool exhausted during peak sync window", "/api/sync/run"],
      ["auth", "WARNING", "Repeated failed sign-in attempts for billing@jabit.com", "5 failed attempts within 2 minutes", "/api/auth/login"],
      ["jobs", "CRITICAL", "Job 'nightly-payroll-export' exceeded maximum runtime", "Job killed after 30 minutes", "/jobs/worker"],
      ["api", "ERROR", "Rate limit exceeded for GET /v1/organisations", "Client exceeded 600 req/min", "/api/v1/organisations"],
      ["integration", "ERROR", "MYOB webhook signature validation failed", "Signature mismatch — possible clock skew", "/api/webhooks/myob"],
      ["storage", "WARNING", "Object storage latency above 2s threshold", "p95 latency 2.4s over 5 minutes", "/api/files"],
      ["billing", "ERROR", "Invoice generation failed for 3 organisations", "Missing tax registration number", "/jobs/invoicing"],
      ["api", "INFO", "Recovered from transient UpstreamTimeout on Google Workspace", "Retry succeeded on attempt 2", "/api/integrations/google"],
      ["database", "ERROR", "Deadlock detected on audit_log insert", "Transaction retried successfully", "/api/audit"],
    ] as const;

    for (let i = 0; i < errorDefs.length; i++) {
      const [source, severity, message, cause, path] = errorDefs[i];
      await prisma.errorLog.create({
        data: {
          source, severity, message, path,
          stackTrace: `${message}\n  cause: ${cause}\n    at handler (${path}:1${20 + i}:${8 + i})\n    at async executeTask (src/jobs/runner.ts:88:5)`,
          context: { correlationId: `cor_${1000 + i}`, attempt: (i % 3) + 1 },
          resolved: i === 8,
          occurredAt: new Date(Date.now() - 1000 * 60 * 30 * (i + 1)),
        },
      });
    }
  }

  // ── Diagnostics: jobs ────────────────────────────────────────────────
  const jobCount = await prisma.job.count()
  if (jobCount === 0) {
    const jobDefs = [
      ["nightly-payroll-export", "payroll", "FAILED", 3, "Job exceeded maximum runtime of 30m"],
      ["org-sync-xero", "integrations", "RUNNING", 1, null],
      ["subscription-invoicing", "billing", "SUCCEEDED", 1, null],
      ["audit-log-archival", "compliance", "SUCCEEDED", 1, null],
      ["integration-health-probe", "integrations", "SUCCEEDED", 1, null],
      ["weekly-digest-email", "notifications", "QUEUED", 0, null],
      ["session-cleanup", "security", "SUCCEEDED", 1, null],
      ["backup-verification", "infrastructure", "FAILED", 2, "S3 endpoint returned 503 Service Unavailable"],
      ["webhook-redelivery", "integrations", "QUEUED", 0, null],
      ["seat-usage-recalc", "billing", "SUCCEEDED", 1, null],
      ["gdpr-export-request", "compliance", "CANCELLED", 1, "Cancelled by operator"],
      ["search-index-rebuild", "platform", "RUNNING", 1, null],
    ] as const;

    for (let i = 0; i < jobDefs.length; i++) {
      const [name, queue, status, attempts, error] = jobDefs[i];
      const queuedAt = new Date(Date.now() - 1000 * 60 * (10 + i * 17));
      const terminal = ["SUCCEEDED", "FAILED", "CANCELLED"].includes(status);
      await prisma.job.create({
        data: {
          name, queue, status, attempts,
          error,
          result: status === "SUCCEEDED" ? "Completed with 0 errors" : null,
          payload: { orgCount: 30, batch: i + 1 },
          queuedAt,
          startedAt: status === "QUEUED" ? null : new Date(queuedAt.getTime() + 5000),
          finishedAt: terminal ? new Date(queuedAt.getTime() + 95000) : null,
          durationMs: terminal ? 90000 : null,
        },
      });
    }
  }

  // ── Security: sessions ───────────────────────────────────────────────
  const sessionCount = await prisma.userSession.count()
  if (sessionCount < 4) {
    const agents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
    ];
    const allUsers = [superAdmin, ...otherUsers];
    for (let i = 0; i < 6; i++) {
      const u = allUsers[i % allUsers.length];
      const created = new Date(Date.now() - 1000 * 60 * 60 * (i + 1));
      await prisma.userSession.create({
        data: {
          userId: u.id,
          token: `seed_${u.id}_${i}_${created.getTime()}`,
          ip: `10.1.${i}.24`,
          userAgent: agents[i % agents.length],
          createdAt: created,
          lastSeenAt: new Date(created.getTime() + 1000 * 60 * 12),
          expiresAt: new Date(created.getTime() + 1000 * 60 * 60 * 12),
          revokedAt: i === 4 ? new Date() : null,
        },
      });
    }
  }

  // ── Audit logs ───────────────────────────────────────────────────────
  const auditCount = await prisma.auditLog.count()
  if (auditCount < 20) {
    const actions: Array<[string, string, string, string]> = [
      ["ORG_CREATED", "Organisations", "INFO", "Created organisation 'Coral Coast Tourism'"],
      ["ORG_DISABLED", "Organisations", "WARNING", "Disabled organisation 'Reef Point Hospitality' — payment overdue"],
      ["PLAN_UPDATED", "Subscriptions", "INFO", "Updated plan 'GROWTH' price from $129 to $149"],
      ["SUBSCRIPTION_CHANGED", "Subscriptions", "INFO", "Upgraded 'Blue Wren Retail Group' to BUSINESS plan"],
      ["INTEGRATION_CONNECTED", "Integrations", "INFO", "Connected Xero for 'Harbour Logistics Pty Ltd'"],
      ["INTEGRATION_DISCONNECTED", "Integrations", "WARNING", "Disconnected MYOB for 'Granite Peak Consulting'"],
      ["SYNC_TRIGGERED", "Integrations", "INFO", "Manual sync triggered for 12 organisations"],
      ["BUSINESS_RULE_UPDATED", "System Configuration", "INFO", "Changed 'overtime_threshold' from 40 to 38 hours"],
      ["GLOBAL_SETTING_UPDATED", "System Configuration", "INFO", "Updated 'support_email' setting"],
      ["NOTIFICATION_UPDATED", "System Configuration", "INFO", "Disabled notification 'weekly_digest'"],
      ["ROLE_UPDATED", "Security", "INFO", "Granted 'int.sync' permission to PLATFORM_OPS"],
      ["SESSION_REVOKED", "Security", "WARNING", "Revoked active session for ops@jabit.com"],
      ["USER_LOGIN", "Security", "INFO", "Successful sign-in from 10.1.0.24"],
      ["ERROR_RESOLVED", "Platform Diagnostics", "INFO", "Marked error 'Deadlock detected on audit_log insert' as resolved"],
      ["JOB_RETRIED", "Platform Diagnostics", "WARNING", "Retried job 'backup-verification' — attempt 2 failed"],
      ["ORG_UPDATED", "Organisations", "INFO", "Updated contact details for 'Murray River Farms'"],
      ["PERMISSION_EXPORTED", "Security", "INFO", "Exported role permission matrix as CSV"],
      ["AUDIT_LOG_EXPORTED", "Audit Logs", "INFO", "Exported 1,200 audit records for compliance review"],
      ["SUBSCRIPTION_CANCELLED", "Subscriptions", "WARNING", "Cancelled subscription for 'Jacaranda Learning Centres'"],
      ["MFA_SETTING_CHANGED", "Security", "WARNING", "MFA requirement for administrators disabled"],
      ["INTEGRATION_MAPPING_UPDATED", "Integrations", "INFO", "Re-mapped Google Workspace account for 'Southern Cloud Software'"],
      ["ORG_ENABLED", "Organisations", "INFO", "Re-enabled organisation 'Ironbark Manufacturing'"],
    ];

    for (let i = 0; i < actions.length; i++) {
      const [action, category, severity, description] = actions[i];
      const org = category === "Organisations" ? orgs[i % orgs.length].id : null;
      await prisma.auditLog.create({
        data: {
          action, category, severity, description,
          entityType: category,
          entityId: `ent_${1000 + i}`,
          metadata: { source: "console", requestId: `req_${2000 + i}` },
          ipAddress: `10.1.${i % 6}.24`,
          userAgent: agentsSafe[i % agentsSafe.length],
          userId: [superAdmin, ...otherUsers][i % 4].id,
          organisationId: org,
          createdAt: new Date(Date.now() - 1000 * 60 * 45 * (i + 1)),
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log(`  Users:        ${await prisma.user.count()}`);
  console.log(`  Organisations:${await prisma.organisation.count()}`);
  console.log(`  Plans:        ${await prisma.plan.count()}`);
  console.log(`  Integrations: ${await prisma.integration.count()}`);
  console.log(`  Sync logs:    ${await prisma.syncLog.count()}`);
  console.log(`  Audit logs:   ${await prisma.auditLog.count()}`);
}

const agentsSafe = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
];

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
