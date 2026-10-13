import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "pc_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "peoplecore-super-admin-secret-change-me"
);

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  /** null/undefined = platform (super admin) account. */
  organisationId?: string | null;
  organisationName?: string | null;
};

export async function createSession(user: SessionUser) {
  // The row key is minted first so it can be embedded in the token itself,
  // letting logout revoke exactly this session.
  const rowKey = randomBytes(24).toString("hex");

  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    org: user.organisationId ?? null,
    orgName: user.organisationName ?? null,
    sid: rowKey,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);

  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });

  // Mirror into a durable DB row so the Security → Sessions screen has data.
  await prisma.userSession.create({
    data: {
      userId: user.id,
      token: rowKey,
      expiresAt: expires,
    },
  });

  return token;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.sid) {
        await prisma.userSession
          .updateMany({
            where: { token: payload.sid as string, revokedAt: null },
            data: { revokedAt: new Date() },
          })
          .catch(() => undefined);
      }
    } catch {
      // Expired/invalid token — nothing to revoke server-side.
    }
  }
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) return null;
    return {
      id: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      roles: (payload.roles as string[]) ?? [],
      organisationId: (payload.org as string | null) ?? null,
      organisationName: (payload.orgName as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

/**
 * Guard for /org/* routes and APIs. Returns the session together with the
 * organisation id it is scoped to, or throws when the account is not an
 * organisation account (e.g. a super admin stumbling into /org).
 */
export async function requireOrgSession(): Promise<
  SessionUser & { organisationId: string }
> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (!session.organisationId) throw new Error("NOT_AN_ORG_ACCOUNT");
  return session as SessionUser & { organisationId: string };
}

/** True when the signed-in account belongs to an organisation. */
export function isOrgAccount(session: SessionUser | null): boolean {
  return Boolean(session?.organisationId);
}

/** Roles whose console home is the HR Admin console (/hr). */
const HR_CONSOLE_ROLES = ["HR_MANAGER", "HR_ADMIN"];

/** Roles whose console home is the Employee self-service portal (/employee). */
const EMPLOYEE_CONSOLE_ROLES = ["EMPLOYEE"];

/** Roles whose console home is the Payroll console (/payroll). */
const PAYROLL_CONSOLE_ROLES = ["PAYROLL_MANAGER", "PAYROLL_ADMIN"];

/** Landing route for whichever role the signed-in account holds. */
export function homeFor(session: SessionUser): string {
  if (!session.organisationId) return "/dashboard";
  if (session.roles.some((r) => PAYROLL_CONSOLE_ROLES.includes(r))) return "/payroll/dashboard";
  if (session.roles.some((r) => HR_CONSOLE_ROLES.includes(r))) return "/hr/dashboard";
  if (session.roles.some((r) => EMPLOYEE_CONSOLE_ROLES.includes(r))) {
    return "/employee/dashboard";
  }
  return "/org/dashboard";
}
