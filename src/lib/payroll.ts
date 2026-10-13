import "server-only";
import { redirect } from "next/navigation";
import { requireOrgSession, homeFor, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Roles allowed into the Payroll console. */
export const PAYROLL_ROLES = ["PAYROLL_MANAGER", "PAYROLL_ADMIN", "ORG_ADMIN"] as const;

export function canUsePayrollConsole(session: SessionUser | null): boolean {
  if (!session?.organisationId) return false;
  return session.roles.some((r) => (PAYROLL_ROLES as readonly string[]).includes(r));
}

export type PayrollContext = {
  session: SessionUser & { organisationId: string };
  organisationId: string;
  org: {
    id: string;
    name: string;
    slug: string;
    abn: string | null;
    industry: string | null;
    city: string | null;
    state: string | null;
  };
  /** The signed-in payroll user's own employee profile, when linked. */
  me: { id: string; firstName: string; lastName: string } | null;
};

/**
 * Every /payroll page calls this first. Resolves the session, verifies the
 * caller is payroll-capable, and returns the tenant scope for Prisma queries.
 */
export async function payrollContext(): Promise<PayrollContext> {
  const session = await requireOrgSession().catch(() => null);
  if (!session) redirect("/login");
  if (!canUsePayrollConsole(session)) redirect(homeFor(session));

  const org = await prisma.organisation.findUnique({
    where: { id: session.organisationId },
    select: { id: true, name: true, slug: true, status: true, abn: true, industry: true, city: true, state: true },
  });
  if (!org) redirect("/login");
  if (org.status === "DISABLED") redirect("/login?error=organisation_disabled");

  const me = await prisma.employee.findFirst({
    where: { userId: session.id },
    select: { id: true, firstName: true, lastName: true },
  });

  return {
    session,
    organisationId: session.organisationId,
    org: { id: org.id, name: org.name, slug: org.slug, abn: org.abn, industry: org.industry, city: org.city, state: org.state },
    me,
  };
}

/** Shared, side-effect-free query helpers (same semantics as the other consoles). */
export { intParam, strParam, qs } from "@/lib/org";
