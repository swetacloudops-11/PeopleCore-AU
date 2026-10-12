import "server-only";
import { redirect } from "next/navigation";
import { requireOrgSession, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type OrgContext = {
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
  /** Convenience: the signed-in admin's linked employee profile (may be null). */
  me: { id: string; firstName: string; lastName: string } | null;
};

/**
 * Every /org page should call this first. Resolves the signed-in session,
 * verifies it belongs to a live organisation, and returns the tenant scope
 * to pass into Prisma queries.
 */
export async function orgContext(): Promise<OrgContext> {
  const session = await requireOrgSession().catch(() => null);
  if (!session) redirect("/login");

  const org = await prisma.organisation.findUnique({
    where: { id: session.organisationId },
    select: {
      id: true, name: true, slug: true, status: true, email: true,
      phone: true, city: true, state: true, abn: true, industry: true,
      employeeCount: true, addressLine1: true, postcode: true, createdAt: true,
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

/** Parse a positive integer query param with a safe default. */
export function intParam(value: string | undefined, fallback: number, max?: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(n) || n < 1) return fallback;
  return max ? Math.min(n, max) : n;
}

/** Read a non-empty search string from searchParams. */
export function strParam(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Build a query string from a partial record, dropping empty values. */
export function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === "ALL") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
