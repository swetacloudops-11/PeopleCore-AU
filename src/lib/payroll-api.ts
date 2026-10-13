import "server-only";
import { NextResponse } from "next/server";
import { requireOrgSession, type SessionUser } from "@/lib/auth";
import { canUsePayrollConsole } from "@/lib/payroll";

export type PayrollApiContext = {
  session: SessionUser & { organisationId: string };
  organisationId: string;
};

/**
 * Guard for /api/payroll/* route handlers. Returns 401 when signed out and 403
 * when the account is not payroll-capable for its organisation.
 */
export async function payrollApi(): Promise<
  { ok: true; ctx: PayrollApiContext } | { ok: false; response: NextResponse }
> {
  const session = await requireOrgSession().catch(() => null);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
  }
  if (!canUsePayrollConsole(session)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Your role cannot access the payroll console" }, { status: 403 }),
    };
  }
  return { ok: true, ctx: { session, organisationId: session.organisationId } };
}

/** Convert a Zod-style issue list into the {fields} shape the UI expects. */
export { fieldErrors, clientIp } from "@/lib/org-api";
