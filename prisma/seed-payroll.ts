/**
 * Payroll Admin console seed.
 *
 * Creates pay@jabit.com (PAYROLL_MANAGER) on the demo organisation and tops up
 * the payroll data that the new /payroll console needs:
 *   - penalty-rate pay categories
 *   - payroll settings (pay-run / tax / payslip groups)
 *   - a connected payroll integration + sync history
 *
 * Idempotent — safe to run repeatedly.
 *
 * Run:  npm run db:seed-payroll
 */
import { PrismaClient, PayCategoryType, SyncStatus, MappingStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const p = new PrismaClient();

const ORG_SLUG = "coral-coast-tourism";
const EMAIL = "pay@jabit.com";
const NAME = "Priya Menon";
const PASSWORD = "Admin@1234";

/** Penalty-style loadings (stored as ALLOWANCE — the enum has no PENALTY member). */
const PENALTY_CATEGORIES: Array<[string, string, number, string]> = [
  ["Saturday Penalty", "PEN-SAT", 1.25, "MULTIPLIER"],
  ["Sunday Penalty", "PEN-SUN", 1.5, "MULTIPLIER"],
  ["Public Holiday Penalty", "PEN-PH", 2.5, "MULTIPLIER"],
  ["Evening Loading", "PEN-EVE", 1.15, "MULTIPLIER"],
  ["Night Shift Loading", "PEN-NIGHT", 1.3, "MULTIPLIER"],
];

const PAYROLL_SETTINGS: Array<[string, string, string, string, string]> = [
  ["payroll", "pay_run_auto_calculate", "Auto-calculate pay runs", "true", "boolean"],
  ["payroll", "timesheet_approval_required", "Timesheets require approval", "true", "boolean"],
  ["payroll", "payslip_footer", "Payslip footer note", "Pay processed by PeopleCore AU", "string"],
  ["payroll", "payslip_show_hours", "Show hours on payslips", "true", "boolean"],
  ["payroll", "tax_scale", "PAYG tax scale", "Resident tax-free threshold", "string"],
  ["payroll", "stp_enabled", "Single Touch Payroll enabled", "true", "boolean"],
  ["payroll", "super_default_fund", "Default superannuation fund", "AustralianSuper", "string"],
  ["payroll", "pay_period_lock_day", "Lock pay periods after (days)", "2", "number"],
];

async function main() {
  console.log("Seeding Payroll Admin console …");

  const org = await p.organisation.findFirst({ where: { slug: ORG_SLUG } });
  if (!org) throw new Error(`Organisation ${ORG_SLUG} not found — run db:seed-org first.`);

  // ── 1. payroll account ─────────────────────────────────────────
  const hash = await bcrypt.hash(PASSWORD, 10);
  const user = await p.user.upsert({
    where: { email: EMAIL },
    update: { organisationId: org.id, status: "ACTIVE", name: NAME },
    create: {
      email: EMAIL,
      passwordHash: hash,
      name: NAME,
      status: "ACTIVE",
      organisationId: org.id,
      lastLoginAt: new Date(Date.now() - 1000 * 60 * 45),
    },
  });

  const role = await p.role.findFirst({
    where: { key: "PAYROLL_MANAGER", organisationId: org.id },
    select: { id: true },
  });
  if (!role) throw new Error("PAYROLL_MANAGER role not found — run db:seed-org first.");

  await p.roleAssignment.deleteMany({ where: { userId: user.id } });
  await p.roleAssignment.create({ data: { userId: user.id, roleId: role.id } });
  console.log(`  Account: ${EMAIL} → PAYROLL_MANAGER`);

  // ── 2. penalty-rate categories ─────────────────────────────────
  let categoriesAdded = 0;
  for (const [name, code, rate, unit] of PENALTY_CATEGORIES) {
    const existing = await p.payCategory.findFirst({
      where: { organisationId: org.id, code },
      select: { id: true },
    });
    if (existing) continue;
    await p.payCategory.create({
      data: {
        organisationId: org.id,
        name,
        code,
        type: PayCategoryType.ALLOWANCE,
        rate,
        unit,
        isTaxable: true,
        isSuperable: false,
        appliesTo: "ALL",
        sortOrder: 20,
      },
    });
    categoriesAdded++;
  }
  console.log(`  Penalty categories added: ${categoriesAdded}`);

  // ── 3. payroll settings ────────────────────────────────────────
  let settingsAdded = 0;
  for (const [group, key, label, value, dataType] of PAYROLL_SETTINGS) {
    const res = await p.orgSetting.upsert({
      where: { organisationId_key: { organisationId: org.id, key } },
      update: { group, label, value, dataType },
      create: { organisationId: org.id, group, key, label, value, dataType },
    });
    if (res) settingsAdded++;
  }
  console.log(`  Payroll settings ensured: ${settingsAdded}`);

  // ── 4. connected payroll integration + sync logs ───────────────
  let integration = await p.integration.findFirst({
    where: { category: "PAYROLL" },
    orderBy: { sortOrder: "asc" },
  });
  if (!integration) {
    integration = await p.integration.create({
      data: {
        key: "xero-payroll",
        name: "Xero Payroll",
        provider: "Xero",
        category: "PAYROLL",
        description: "Sync pay runs, payslips and superannuation with Xero Payroll.",
        isOfficial: true,
        sortOrder: 10,
      },
    });
    console.log(`  Created catalogue integration: ${integration.name}`);
  }

  const mapping = await p.organisationIntegration.upsert({
    where: {
      organisationId_integrationId: { organisationId: org.id, integrationId: integration.id },
    },
    update: { status: MappingStatus.CONNECTED },
    create: {
      organisationId: org.id,
      integrationId: integration.id,
      status: MappingStatus.CONNECTED,
      externalAccountName: "Coral Coast Tourism Pty Ltd",
      scopes: ["payroll.read", "payroll.write"],
      connectedAt: new Date(Date.now() - 90 * 86_400_000),
      lastSyncAt: new Date(Date.now() - 6 * 3_600_000),
      lastSyncStatus: "SUCCESS",
    },
  });
  console.log(`  Connected payroll integration: ${integration.name}`);

  const existingLogs = await p.syncLog.count({ where: { organisationId: org.id, integrationId: integration.id } });
  if (existingLogs === 0) {
    const now = Date.now();
    await p.syncLog.createMany({
      data: [
        {
          organisationId: org.id, integrationId: integration.id, mappingId: mapping.id,
          direction: "OUTBOUND", trigger: "SCHEDULED", status: SyncStatus.SUCCESS,
          recordsTotal: 40, recordsSuccess: 40, recordsFailed: 0, durationMs: 1840,
          startedAt: new Date(now - 6 * 3_600_000), finishedAt: new Date(now - 6 * 3_600_000 + 1840),
        },
        {
          organisationId: org.id, integrationId: integration.id, mappingId: mapping.id,
          direction: "OUTBOUND", trigger: "SCHEDULED", status: SyncStatus.PARTIAL,
          recordsTotal: 40, recordsSuccess: 37, recordsFailed: 3, durationMs: 2210,
          message: "3 employee records missing super fund details",
          startedAt: new Date(now - 30 * 3_600_000), finishedAt: new Date(now - 30 * 3_600_000 + 2210),
        },
        {
          organisationId: org.id, integrationId: integration.id, mappingId: mapping.id,
          direction: "INBOUND", trigger: "MANUAL", status: SyncStatus.SUCCESS,
          recordsTotal: 40, recordsSuccess: 40, recordsFailed: 0, durationMs: 1520,
          startedAt: new Date(now - 78 * 3_600_000), finishedAt: new Date(now - 78 * 3_600_000 + 1520),
        },
      ],
    });
    console.log("  Sync log history created: 3");
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
