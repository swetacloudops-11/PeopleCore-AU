import "server-only";
import { redirect } from "next/navigation";
import { requireOrgSession, homeFor, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Roles allowed into the HR Admin console.
 *
 * ORG_ADMIN is included so an organisation administrator with HR oversight can
 * still reach these screens; HR_ADMIN exists for orgs that split the role.
 */
export const HR_ROLES = ["HR_MANAGER", "HR_ADMIN", "ORG_ADMIN"] as const;

export function canUseHrConsole(session: SessionUser | null): boolean {
  if (!session?.organisationId) return false;
  return session.roles.some((r) => (HR_ROLES as readonly string[]).includes(r));
}

export type HrContext = {
  session: SessionUser & { organisationId: string };
  organisationId: string;
  org: {
    id: string;
    name: string;
    slug: string;
    status: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    state: string | null;
    abn: string | null;
    industry: string | null;
    employeeCount: number;
    addressLine1: string | null;
    postcode: string | null;
    createdAt: Date;
  };
  /** Convenience: the signed-in HR user's own employee profile (may be null). */
  me: { id: string; firstName: string; lastName: string } | null;
};

/**
 * Every /hr page must call this first. Resolves the session, verifies the
 * caller holds an HR-capable role, and returns the tenant scope to use in
 * Prisma queries.
 */
export async function hrContext(): Promise<HrContext> {
  const session = await requireOrgSession().catch(() => null);
  if (!session) redirect("/login");

  // Wrong role for this console — send them to whatever console is theirs.
  if (!canUseHrConsole(session)) redirect(homeFor(session));

  const org = await prisma.organisation.findUnique({
    where: { id: session.organisationId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      email: true,
      phone: true,
      city: true,
      state: true,
      abn: true,
      industry: true,
      employeeCount: true,
      addressLine1: true,
      postcode: true,
      createdAt: true,
    },
  });

  if (!org) redirect("/login");
  if (org.status === "DISABLED") redirect("/login?error=organisation_disabled");

  const me = await prisma.employee.findFirst({
    where: { userId: session.id },
    select: { id: true, firstName: true, lastName: true },
  });

  return { session, organisationId: session.organisationId, org, me };
}

/** Shared, side-effect-free query helpers (same semantics as the org console). */
export { intParam, strParam, qs } from "@/lib/org";
