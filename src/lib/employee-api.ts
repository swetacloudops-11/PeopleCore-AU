import "server-only";
import { NextResponse } from "next/server";
import { requireOrgSession, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type EmployeeApiContext = {
  session: SessionUser & { organisationId: string };
  organisationId: string;
  /** The signed-in person's own employee record — mutate only rows tied to it. */
  employeeId: string;
};

/**
 * Guard for /api/employee/* route handlers. Returns 401 when signed out, 403
 * when the account has no linked employee profile. Every mutation must then
 * verify the target row's employeeId matches ctx.employeeId.
 */
export async function employeeApi(): Promise<
  { ok: true; ctx: EmployeeApiContext } | { ok: false; response: NextResponse }
> {
  const session = await requireOrgSession().catch(() => null);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    };
  }

  const emp = await prisma.employee.findFirst({
    where: { organisationId: session.organisationId, userId: session.id },
    select: { id: true },
  });
  if (!emp) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No employee profile is linked to this account" },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    ctx: { session, organisationId: session.organisationId, employeeId: emp.id },
  };
}

/** Convert a Zod-style issue list into the {fields} shape the UI expects. */
export { fieldErrors, clientIp } from "@/lib/org-api";
