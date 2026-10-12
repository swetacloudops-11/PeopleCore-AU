import "server-only";
import { NextResponse } from "next/server";
import { requireOrgSession, type SessionUser } from "@/lib/auth";
import { canUseHrConsole } from "@/lib/hr";

export type HrApiContext = {
  session: SessionUser & { organisationId: string };
  organisationId: string;
};

/**
 * Guard for /api/hr/* route handlers. Returns 401 when signed out and 403
 * when the account is not an HR-capable organisation account.
 */
export async function hrApi(): Promise<
  { ok: true; ctx: HrApiContext } | { ok: false; response: NextResponse }
> {
  const session = await requireOrgSession().catch(() => null);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    };
  }
  if (!canUseHrConsole(session)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Your role cannot access the HR console" },
        { status: 403 }
      ),
    };
  }
  return {
    ok: true,
    ctx: { session, organisationId: session.organisationId },
  };
}

/** Convert a Zod-style issue list into the {fields} shape the UI expects. */
export { fieldErrors, clientIp } from "@/lib/org-api";
