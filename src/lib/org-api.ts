import "server-only";
import { NextResponse } from "next/server";
import { requireOrgSession, type SessionUser } from "@/lib/auth";

export type OrgApiContext = {
  session: SessionUser & { organisationId: string };
  organisationId: string;
};

/**
 * Guard for /api/org/* route handlers. Returns 401 when signed out and 403
 * when the account is not an organisation account.
 */
export async function orgApi(): Promise<
  { ok: true; ctx: OrgApiContext } | { ok: false; response: NextResponse }
> {
  const session = await requireOrgSession().catch(() => null);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    };
  }
  if (!session.organisationId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This account has no organisation scope" },
        { status: 403 }
      ),
    };
  }

  // Self-service-only accounts have no business in the organisation APIs.
  if (session.roles.length === 1 && session.roles[0] === "EMPLOYEE") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This account is limited to self-service" },
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
export function fieldErrors(
  issues: Array<{ path: PropertyKey[]; message: string }>
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function clientIp(req: Request): string | undefined {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}
