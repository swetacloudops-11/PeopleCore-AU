/**
 * HR Admin console seed (top-up).
 *
 * The main seed (seed-org.ts) populated Coral Coast Tourism with 60 employees,
 * leave, onboarding, policies and settings — but left EmployeeDocument and
 * Certification empty, so the HR console's Documents and Certifications
 * modules would render empty states.
 *
 * This script:
 *   1. Creates the HR Admin account  hr@jabitsoft.com  (HR_MANAGER).
 *   2. Backfills certification catalogue + per-employee certification records.
 *   3. Backfills per-employee HR documents (contracts, ID, police checks …).
 *
 * It is idempotent — safe to run repeatedly.
 *
 * Run:  npm run db:seed-hr
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const p = new PrismaClient();

const ORG_SLUG = "coral-coast-tourism";
const HR_EMAIL = "hr@jabitsoft.com";
const HR_NAME = "Priya Nair";
const PASSWORD = "Admin@1234";

const DAY = 86_400_000;
const now = new Date();
const addDays = (n: number) => new Date(now.getTime() + n * DAY);
const addMonths = (n: number) => {
  const d = new Date(now);
  d.setMonth(d.getMonth() + n);
  return d;
};

/** Small deterministic RNG so re-runs produce the same dataset. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const CERTS: Array<[string, string, number | null, boolean]> = [
  ["First Aid Certificate (HLTAID011)", "St John Ambulance", 24, true],
  ["CPR Certificate (HLTAID009)", "St John Ambulance", 12, true],
  ["Responsible Service of Alcohol (RSA)", "NSW Liquor & Gaming", 36, false],
  ["Food Safety Handler", "TAFE NSW", 36, false],
  ["Working with Children Check", "NSW Office of the Children's Guardian", 60, true],
  ["White Card (Construction Induction)", "SafeWork NSW", 60, false],
  ["Manual Handling", "WHS Training Co", 24, false],
  ["Forklift Licence (LF)", "SafeWork NSW", 60, false],
  ["Customer Service Excellence", "Service Skills Australia", 36, false],
  ["Mental Health First Aid", "MHFA Australia", 36, false],
];

/** title, category, expiryInDays|null, confidential */
const DOC_TEMPLATES: Array<[string, string, number | null, boolean]> = [
  ["Employment Contract", "Contract", null, false],
  ["Position Description", "Contract", null, false],
  ["Tax File Number Declaration", "Tax", null, true],
  ["Superannuation Standard Choice Form", "Tax", null, true],
  ["Passport", "Identification", 900, true],
  ["Driver Licence", "Identification", 400, true],
  ["Police Check", "Police Check", 120, true],
  ["Visa – Subclass 482 (TSS)", "Visa", 200, true],
  ["Qualification – Certificate III", "Qualification", null, false],
  ["Pre-employment Medical", "Medical", 240, true],
  ["Emergency Contact Form", "Other", null, false],
];

async function main() {
  console.log("Seeding HR Admin console data …");

  const org = await p.organisation.findFirst({ where: { slug: ORG_SLUG } });
  if (!org) throw new Error(`Organisation ${ORG_SLUG} not found — run db:seed-org first.`);
  console.log(`  Organisation: ${org.name} (${org.id})`);

  // ── 1. HR Admin account ────────────────────────────────────────
  const hash = await bcrypt.hash(PASSWORD, 10);
  const hrUser = await p.user.upsert({
    where: { email: HR_EMAIL },
    update: { organisationId: org.id, status: "ACTIVE", name: HR_NAME },
    create: {
      email: HR_EMAIL,
      passwordHash: hash,
      name: HR_NAME,
      status: "ACTIVE",
      organisationId: org.id,
      lastLoginAt: new Date(Date.now() - 1000 * 60 * 90),
    },
  });

  const hrRole = await p.role.findFirst({
    where: { key: "HR_MANAGER", organisationId: org.id },
    select: { id: true },
  });
  if (!hrRole) throw new Error("HR_MANAGER role not found — run db:seed-org first.");

  await p.roleAssignment.deleteMany({ where: { userId: hrUser.id } });
  await p.roleAssignment.create({ data: { userId: hrUser.id, roleId: hrRole.id } });
  console.log(`  Account: ${HR_EMAIL} → HR_MANAGER`);

  const employees = await p.employee.findMany({
    where: { organisationId: org.id, employmentStatus: { not: "TERMINATED" } },
    orderBy: { employeeNumber: "asc" },
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
  });
  if (employees.length === 0) throw new Error("No employees found for this organisation.");

  // ── 2. Certification catalogue ─────────────────────────────────
  const certIds: string[] = [];
  for (const [name, issuingBody, validityMonths, isMandatory] of CERTS) {
    const c = await p.certification.upsert({
      where: { organisationId_name: { organisationId: org.id, name } },
      update: { issuingBody, validityMonths, isMandatory },
      create: {
        organisationId: org.id,
        name,
        issuingBody,
        validityMonths,
        isMandatory,
        description: `${name} — issued by ${issuingBody}.`,
      },
    });
    certIds.push(c.id);
  }
  console.log(`  Certification catalogue: ${certIds.length}`);

  // ── 3. Per-employee certifications ─────────────────────────────
  const rand = rng(20261011);
  let certRecords = 0;
  for (const emp of employees) {
    const take = 1 + Math.floor(rand() * 4); // 1–4 certs each
    const chosen = new Set<number>();
    while (chosen.size < take) chosen.add(Math.floor(rand() * certIds.length));

    for (const idx of chosen) {
      const certId = certIds[idx];
      const [, , validityMonths] = CERTS[idx];
      const roll = rand();

      // Spread across CURRENT / EXPIRING / EXPIRED / PENDING.
      let status: "CURRENT" | "EXPIRING" | "EXPIRED" | "PENDING";
      let issuedDate: Date | null = null;
      let expiryDate: Date | null = null;

      if (roll < 0.12) {
        status = "PENDING";
      } else if (roll < 0.34) {
        status = "EXPIRING";
        issuedDate = addMonths(-Math.abs(validityMonths ?? 12) + 2);
        expiryDate = addDays(Math.floor(rand() * 75) + 1);
      } else if (roll < 0.44) {
        status = "EXPIRED";
        issuedDate = addMonths(-(validityMonths ?? 12) - Math.floor(rand() * 6) - 1);
        expiryDate = addDays(-(Math.floor(rand() * 90) + 1));
      } else {
        status = "CURRENT";
        issuedDate = addMonths(-Math.floor(rand() * 6));
        expiryDate = addMonths(Math.floor(rand() * ((validityMonths ?? 24) - 6)) + 7);
      }

      await p.employeeCertification.upsert({
        where: { employeeId_certificationId: { employeeId: emp.id, certificationId: certId } },
        update: { status, issuedDate, expiryDate },
        create: {
          employeeId: emp.id,
          certificationId: certId,
          status,
          issuedDate,
          expiryDate,
          certificateNumber: `CERT-${emp.employeeNumber}-${certId.slice(-4).toUpperCase()}`,
        },
      });
      certRecords++;
    }
  }
  console.log(`  Employee certifications: ${certRecords}`);

  // ── 4. Employee documents ──────────────────────────────────────
  await p.employeeDocument.deleteMany({ where: { organisationId: org.id } });
  const docRows: Array<{
    organisationId: string;
    employeeId: string;
    title: string;
    category: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    isConfidential: boolean;
    expiryDate: Date | null;
    createdAt: Date;
  }> = [];

  for (const emp of employees) {
    const rand2 = rng(emp.employeeNumber.length * 7919 + emp.firstName.charCodeAt(0) * 131);
    // Always the core contract pack, then a random slice of the rest.
    const picks = DOC_TEMPLATES.filter((_, i) => i < 4 || rand2() < 0.7);
    for (const [title, category, expiryInDays, confidential] of picks) {
      const safeName = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

      // Spread expiries so the tracking screen has a realistic mix:
      // some already expired, some expiring soon, the rest far out.
      let expiryDate: Date | null = null;
      if (expiryInDays !== null) {
        const roll = rand2();
        if (roll < 0.1) {
          expiryDate = addDays(-(1 + Math.floor(rand2() * 120))); // expired
        } else if (roll < 0.32) {
          expiryDate = addDays(1 + Math.floor(rand2() * 58)); // within 60 days
        } else {
          expiryDate = addDays(expiryInDays + Math.floor(rand2() * 120) - 60);
        }
      }

      docRows.push({
        organisationId: org.id,
        employeeId: emp.id,
        title,
        category,
        fileName: `${safeName}-${emp.employeeNumber}.pdf`,
        fileType: "application/pdf",
        fileSize: 80_000 + Math.floor(rand2() * 900_000),
        isConfidential: confidential,
        expiryDate,
        createdAt: addDays(-Math.floor(rand2() * 300) - 5),
      });
    }
  }
  await p.employeeDocument.createMany({ data: docRows });
  console.log(`  Employee documents: ${docRows.length}`);

  // ── 5. A couple of HR-setup org settings (idempotent) ──────────
  const settings: Array<[string, string, string, string, string]> = [
    ["hr", "hr:onboarding_owner", "Default onboarding owner", "People & Culture", "string"],
    ["hr", "hr:exit_notice_days", "Minimum notice period (days)", "14", "number"],
    ["documents", "docs:retention_years", "Document retention period (years)", "7", "number"],
    ["documents", "docs:expiry_alert_days", "Expiry alert lead time (days)", "45", "number"],
    ["notifications", "notif:policy_reminder_days", "Policy reminder cadence (days)", "7", "number"],
  ];
  for (const [group, key, label, value, dataType] of settings) {
    await p.orgSetting.upsert({
      where: { organisationId_key: { organisationId: org.id, key } },
      update: { group, label, value, dataType },
      create: { organisationId: org.id, group, key, label, value, dataType },
    });
  }
  console.log(`  HR settings: ${settings.length}`);

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
